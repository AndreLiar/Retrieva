/**
 * Shared status color mappings using semantic design tokens.
 * Use these instead of hardcoding Tailwind color classes.
 */

/** Sync status badge colors */
export const syncStatusColors = {
  syncing: 'bg-warning/10 text-warning',
  completed: 'bg-success/10 text-success',
  active: 'bg-success/10 text-success',
  error: 'bg-destructive/10 text-destructive',
  failed: 'bg-destructive/10 text-destructive',
  processing: 'bg-warning/10 text-warning',
  cancelled: 'bg-muted text-muted-foreground',
  pending: 'bg-info/10 text-info',
  idle: 'bg-muted text-muted-foreground',
} as const;

/** Notification type badge colors */
export const notificationTypeColors = {
  sync_complete: 'bg-success/10 text-success',
  sync_failed: 'bg-destructive/10 text-destructive',
  member_invited: 'bg-info/10 text-info',
  member_joined: 'bg-info/10 text-info',
  workspace_created: 'bg-primary/10 text-primary',
  system: 'bg-muted text-muted-foreground',
} as const;

/** Token health status colors */
export const tokenStatusColors = {
  valid: 'bg-success-muted text-success',
  expired: 'bg-destructive/10 text-destructive',
  revoked: 'bg-destructive/10 text-destructive',
  invalid: 'bg-destructive/10 text-destructive',
  unknown: 'bg-warning-muted text-warning',
} as const;

/** Trust level display colors */
export const trustLevelColors = {
  public: { text: 'text-success', bg: 'bg-success-muted' },
  internal: { text: 'text-warning', bg: 'bg-warning-muted' },
  regulated: { text: 'text-destructive', bg: 'bg-destructive/10' },
} as const;

/** Destructive action class string for AlertDialogAction */
export const destructiveActionClasses =
  'bg-destructive text-destructive-foreground hover:bg-destructive/90';
