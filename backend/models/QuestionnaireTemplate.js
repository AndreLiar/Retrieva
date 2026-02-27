import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
    doraArticle: { type: String, required: true },
    category: { type: String, required: true },
    hint: { type: String, default: '' },
  },
  { _id: false }
);

const questionnaireTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    version: { type: String, required: true, default: '1.0' },
    isDefault: { type: Boolean, default: false, index: true },
    questions: [questionSchema],
  },
  { timestamps: true }
);

export const QuestionnaireTemplate = mongoose.model(
  'QuestionnaireTemplate',
  questionnaireTemplateSchema
);

export default QuestionnaireTemplate;
