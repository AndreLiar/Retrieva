import mongoose from 'mongoose';

// ── Formal risk decision recorded by a compliance officer ──────────────────────
const riskDecisionSchema = new mongoose.Schema(
  {
    decision: { type: String, enum: ['proceed', 'conditional', 'reject'], required: true },
    setBy: { type: String, required: true }, // userId
    setByName: { type: String, default: '' },
    rationale: { type: String, default: '' },
    setAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// ── Art. 30 clause-level sign-off ──────────────────────────────────────────────
const clauseSignoffSchema = new mongoose.Schema(
  {
    clauseRef: { type: String, required: true }, // e.g. 'Art.30(2)(a)'
    status: { type: String, enum: ['accepted', 'rejected', 'waived'], required: true },
    signedBy: { type: String, required: true }, // userId
    signedByName: { type: String, default: '' },
    note: { type: String, default: '' },
    signedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const gapSchema = new mongoose.Schema(
  {
    article: { type: String, required: true }, // e.g. "DORA Article 28(4)(a)"
    domain: { type: String }, // e.g. "Third-Party Risk"
    requirement: { type: String, required: true }, // exact regulatory text
    vendorCoverage: { type: String, default: '' }, // what the vendor doc says
    gapLevel: {
      type: String,
      enum: ['covered', 'partial', 'missing'],
      required: true,
    },
    recommendation: { type: String, default: '' }, // suggested remediation clause
    sourceChunks: [String], // audit trail: chunk IDs
  },
  { _id: false }
);

const documentSchema = new mongoose.Schema(
  {
    fileName: { type: String, required: true },
    fileType: { type: String, enum: ['pdf', 'xlsx', 'docx', 'xls'], required: true },
    fileSize: { type: Number }, // bytes
    qdrantCollectionId: { type: String }, // per-assessment collection
    uploadedAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ['uploading', 'indexed', 'failed'],
      default: 'uploading',
    },
  },
  { _id: false }
);

const assessmentSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    vendorName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    framework: {
      type: String,
      enum: ['DORA', 'CONTRACT_A30'],
      default: 'DORA',
    },
    status: {
      type: String,
      enum: ['pending', 'indexing', 'analyzing', 'complete', 'failed'],
      default: 'pending',
      index: true,
    },
    statusMessage: { type: String, default: '' }, // human-readable progress message
    documents: [documentSchema],
    results: {
      gaps: [gapSchema],
      overallRisk: {
        type: String,
        enum: ['High', 'Medium', 'Low'],
      },
      summary: { type: String },
      generatedAt: { type: Date },
      domainsAnalyzed: [String],
    },
    reportPath: { type: String }, // path to generated .docx
    // Formal compliance decisions (set by compliance officer after review)
    riskDecision: { type: riskDecisionSchema, default: null },
    clauseSignoffs: [clauseSignoffSchema],
    createdBy: {
      type: String,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for listing assessments per workspace
assessmentSchema.index({ workspaceId: 1, createdAt: -1 });
assessmentSchema.index({ createdBy: 1, status: 1 });

export const Assessment = mongoose.model('Assessment', assessmentSchema);
