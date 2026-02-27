import mongoose from 'mongoose';

const questionResponseSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    doraArticle: { type: String, required: true },
    category: { type: String, required: true },
    hint: { type: String, default: '' },
    answer: { type: String, default: '' },
    score: { type: Number, min: 0, max: 100 },
    gapLevel: {
      type: String,
      enum: ['covered', 'partial', 'missing'],
    },
    reasoning: { type: String, default: '' },
  },
  { _id: false }
);

const vendorQuestionnaireSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QuestionnaireTemplate',
    },
    vendorName: { type: String, required: true, trim: true, maxlength: 200 },
    vendorEmail: { type: String, required: true, trim: true, lowercase: true },
    vendorContactName: { type: String, trim: true, default: '' },
    token: { type: String, index: { unique: true, sparse: true } },
    tokenExpiresAt: { type: Date },
    status: {
      type: String,
      enum: ['draft', 'sent', 'partial', 'complete', 'expired', 'failed'],
      default: 'draft',
    },
    statusMessage: { type: String, default: '' },
    sentAt: { type: Date },
    respondedAt: { type: Date },
    questions: [questionResponseSchema],
    overallScore: { type: Number, min: 0, max: 100 },
    results: {
      summary: { type: String, default: '' },
      domainsAnalyzed: [String],
      generatedAt: { type: Date },
    },
    createdBy: { type: String, required: true, index: true },
  },
  { timestamps: true }
);

vendorQuestionnaireSchema.index({ workspaceId: 1, createdAt: -1 });
vendorQuestionnaireSchema.index({ createdBy: 1, status: 1 });

export const VendorQuestionnaire = mongoose.model('VendorQuestionnaire', vendorQuestionnaireSchema);

export default VendorQuestionnaire;
