export const UserStatus = Object.freeze({
  ONLINE: 'online',
  AWAY: 'away',
  BUSY: 'busy',
  OFFLINE: 'offline',
});

export const VALID_STATUSES = Object.values(UserStatus);
export const PRESENCE_TTL_SECONDS = 600; // 10 minutes
export const TYPING_TTL_SECONDS = 30;
