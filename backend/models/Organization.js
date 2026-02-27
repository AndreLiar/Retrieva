import mongoose from 'mongoose';

const { Schema } = mongoose;

const organizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    industry: {
      type: String,
      enum: ['insurance', 'banking', 'investment', 'payments', 'other'],
      default: 'other',
    },
    country: { type: String, maxlength: 100, default: '' },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export const Organization = mongoose.model('Organization', organizationSchema);
