import mongoose from 'mongoose';

/**
 * Critical or Important Function (DORA) — the anchor for concentration analysis.
 *
 * A business function of the financial entity (e.g. "Claims processing", "Payments")
 * and the providers (assessed Workspaces) it depends on. Human-defined: which function
 * relies on which vendor is a firm-internal governance judgement the firm must own — it
 * is NOT AI-inferred. Org-scoped (concentration spans all the firm's vendors). RTV-15.
 */
const criticalFunctionSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    // DORA distinguishes "critical" from "important" functions — both are in scope,
    // criticality weights the concentration score.
    criticality: {
      type: String,
      enum: ['critical', 'important'],
      required: true,
    },
    description: { type: String, default: '', maxlength: 2000 },
    // Providers this function depends on — references to assessed Workspaces (the
    // provider nodes). Sub-provider (nth-party) reach is computed transitively via
    // ProviderDependency edges, not stored here.
    dependsOn: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Workspace' }],
    createdBy: { type: String, default: '' }, // userId
  },
  { timestamps: true }
);

criticalFunctionSchema.index({ organizationId: 1, name: 1 }, { unique: true });

export const CriticalFunction = mongoose.model('CriticalFunction', criticalFunctionSchema);
