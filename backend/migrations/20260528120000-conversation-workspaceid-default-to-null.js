/**
 * Conversation.workspaceId: legacy string 'default' → null.
 *
 * Ported from the former ad-hoc script (scripts/migrateConversationWorkspaceId.js)
 * into a managed migration. Idempotent: only touches docs still set to 'default'.
 */

export const up = async (db) => {
  await db
    .collection('conversations')
    .updateMany({ workspaceId: 'default' }, { $set: { workspaceId: null } });
};

export const down = async () => {
  // Irreversible: the original 'default' sentinel can't be distinguished from
  // genuinely-null workspaces after the fact. Intentional no-op.
};
