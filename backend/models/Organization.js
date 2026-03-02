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

    // Stripe billing
    stripeCustomerId: { type: String, index: true },
    stripeSubscriptionId: { type: String },
    plan: {
      type: String,
      enum: ['starter', 'professional', 'business', 'enterprise'],
      default: 'starter',
    },
    planStatus: {
      type: String,
      enum: ['trialing', 'active', 'past_due', 'canceled', 'paused'],
      default: 'trialing',
    },
    trialEndsAt: { type: Date },
  },
  { timestamps: true }
);

export const Organization = mongoose.model('Organization', organizationSchema);
