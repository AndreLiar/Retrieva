export const NotificationTypes = {
  WORKSPACE_INVITATION: 'workspace_invitation',
  WORKSPACE_REMOVED: 'workspace_removed',
  PERMISSION_CHANGED: 'permission_changed',
  MEMBER_JOINED: 'member_joined',
  MEMBER_LEFT: 'member_left',
  SYNC_STARTED: 'sync_started',
  SYNC_COMPLETED: 'sync_completed',
  SYNC_FAILED: 'sync_failed',
  INDEXING_COMPLETED: 'indexing_completed',
  INDEXING_FAILED: 'indexing_failed',
  SYSTEM_ALERT: 'system_alert',
  SYSTEM_MAINTENANCE: 'system_maintenance',
  TOKEN_LIMIT_WARNING: 'token_limit_warning',
  TOKEN_LIMIT_REACHED: 'token_limit_reached',
};

export const NotificationPriority = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
};

export const DEFAULT_PREFERENCES = {
  inApp: {
    workspace_invitation: true,
    workspace_removed: true,
    permission_changed: true,
    member_joined: true,
    member_left: false,
    sync_completed: true,
    sync_failed: true,
    indexing_completed: false,
    indexing_failed: true,
    system_alert: true,
    token_limit_warning: true,
  },
  email: {
    workspace_invitation: true,
    workspace_removed: true,
    permission_changed: false,
    sync_failed: true,
    system_alert: true,
    token_limit_reached: true,
  },
};

export const TYPE_DESCRIPTIONS = {
  workspace_invitation: 'When you are invited to a workspace',
  workspace_removed: 'When you are removed from a workspace',
  permission_changed: 'When your workspace permissions change',
  member_joined: 'When a new member joins your workspace',
  member_left: 'When a member leaves your workspace',
  sync_started: 'When a workspace sync starts',
  sync_completed: 'When a workspace sync completes',
  sync_failed: 'When a workspace sync fails',
  indexing_completed: 'When document indexing completes',
  indexing_failed: 'When document indexing fails',
  system_alert: 'Important system notifications',
  system_maintenance: 'Scheduled maintenance notifications',
  token_limit_warning: 'When approaching usage limits',
  token_limit_reached: 'When usage limits are reached',
};

export function isNotificationEnabled(user, type, channel = 'inApp') {
  const prefs = user?.notificationPreferences || DEFAULT_PREFERENCES;
  const channelPrefs = prefs[channel] || DEFAULT_PREFERENCES[channel];
  if (typeof channelPrefs?.[type] === 'boolean') return channelPrefs[type];
  return channel === 'inApp';
}
