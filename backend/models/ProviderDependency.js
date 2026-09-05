import mongoose from 'mongoose';

/**
 * nth-party dependency edge (DORA Art 28(4) subcontracting / concentration).
 *
 * A directed edge parent → child in the org's provider graph. Nodes may be an assessed
 * Workspace (a vendor the firm evaluates) OR an external name (a sub-provider the firm
 * doesn't separately assess, e.g. OpenAI → Azure). This is what lets concentration
 * traverse the chain and detect a shared substrate (many providers → the same Azure).
 * Org-scoped. RTV-15 (P2 auto-populates these from subprocessor lists; P1 = manual).
 */
const nodeSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['workspace', 'external'], required: true },
    // set when kind === 'workspace'
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', default: null },
    // canonical name — always set; the join key for external nodes + shared-substrate
    // detection (normalise before compare: lowercase/trim at the service layer).
    name: { type: String, required: true, trim: true, maxlength: 200 },
    tier: { type: String, enum: ['critical', 'important', 'standard', null], default: null },
  },
  { _id: false }
);

const providerDependencySchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    parent: { type: nodeSchema, required: true },
    child: { type: nodeSchema, required: true },
    relationship: { type: String, default: 'sub_processes_via', maxlength: 100 },
    // Provenance: manual (firm-entered) vs extracted (AI, needs confirmation).
    source: { type: String, enum: ['manual', 'extracted'], default: 'manual' },
    confidence: { type: Number, min: 0, max: 1, default: 1 },
    confirmed: { type: Boolean, default: true }, // extracted edges start unconfirmed
    lastVerifiedAt: { type: Date, default: Date.now },
    createdBy: { type: String, default: '' },
  },
  { timestamps: true }
);

providerDependencySchema.index({ organizationId: 1 });

export const ProviderDependency = mongoose.model('ProviderDependency', providerDependencySchema);
