import mongoose from 'mongoose';

const certificationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['ISO27001', 'SOC2', 'CSA-STAR', 'ISO22301'], required: true },
    validUntil: { type: Date, required: true },
    status: { type: String, enum: ['valid', 'expiring-soon', 'expired'], default: 'valid' },
  },
  { _id: false }
);

const workspaceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    // Owner of the workspace
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Status for document processing
    syncStatus: {
      type: String,
      enum: ['idle', 'syncing', 'synced', 'error'],
      default: 'idle',
    },
    // Vendor profile fields (DORA Article 28)
    vendorTier: { type: String, enum: ['critical', 'important', 'standard'], default: null },
    country: { type: String, trim: true, maxlength: 100, default: '' },
    serviceType: {
      type: String,
      enum: ['cloud', 'software', 'data', 'network', 'other'],
      default: null,
    },
    contractStart: { type: Date, default: null },
    contractEnd: { type: Date, default: null },
    nextReviewDate: { type: Date, default: null },
    vendorStatus: { type: String, enum: ['active', 'under-review', 'exited'], default: 'active' },
    certifications: [certificationSchema],
    vendorFunctions: {
      type: [
        {
          type: String,
          enum: [
            'payment_processing',
            'settlement_clearing',
            'core_banking',
            'risk_management',
            'regulatory_reporting',
            'fraud_detection',
            'data_storage',
            'network_infrastructure',
            'identity_access_management',
            'business_continuity',
          ],
        },
      ],
      default: [],
    },
    exitStrategyDoc: { type: String, default: null },
    alertsSentAt: {
      type: Map,
      of: Date,
      default: {},
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

workspaceSchema.index({ userId: 1, name: 1 });

// Auto-compute certification status based on validUntil date
workspaceSchema.pre('save', async function () {
  const now = new Date();
  const ninetyDays = 90 * 24 * 60 * 60 * 1000;
  this.certifications?.forEach((cert) => {
    if (!cert.validUntil) return;
    if (cert.validUntil < now) cert.status = 'expired';
    else if (cert.validUntil - now <= ninetyDays) cert.status = 'expiring-soon';
    else cert.status = 'valid';
  });
});

export const Workspace = mongoose.model('Workspace', workspaceSchema);
