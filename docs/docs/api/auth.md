---
sidebar_position: 4
---

# Authentication API

User authentication and session management.

## Register

```http
POST /api/v1/auth/register
```

Create a new user account.

### Request Body

```json
{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "John Doe"
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| email | string | Yes | Valid email |
| password | string | Yes | Min 8 characters |
| name | string | Yes | 2-100 characters |

### Response

```json
{
  "status": "success",
  "message": "Registration successful",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "email": "user@example.com",
      "name": "John Doe",
      "createdAt": "2024-01-15T10:00:00.000Z"
    }
  }
}
```

### Cookies Set

| Cookie | HttpOnly | Secure | SameSite | MaxAge |
|--------|----------|--------|----------|--------|
| accessToken | Yes | Prod only | Strict | 15m |
| refreshToken | Yes | Prod only | Strict | 7d |

---

## Login

```http
POST /api/v1/auth/login
```

Authenticate and receive tokens.

### Request Body

```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

### Response

```json
{
  "status": "success",
  "message": "Login successful",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "email": "user@example.com",
      "name": "John Doe"
    }
  }
}
```

### Error: Invalid Credentials

```json
{
  "status": "error",
  "message": "Invalid email or password"
}
```

---

## Logout

```http
POST /api/v1/auth/logout
```

Invalidate current session.

### Response

```json
{
  "status": "success",
  "message": "Logged out successfully"
}
```

Clears `accessToken` and `refreshToken` cookies.

---

## Refresh Token

```http
POST /api/v1/auth/refresh
```

Get a new access token using the refresh token.

### Response

```json
{
  "status": "success",
  "message": "Token refreshed"
}
```

Sets a new `accessToken` cookie.

### Error: Invalid Refresh Token

```json
{
  "status": "error",
  "message": "Invalid refresh token"
}
```

---

## Get Current User

```http
GET /api/v1/auth/me
```

Get the authenticated user's profile.

### Response

```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "user",
      "status": "active",
      "createdAt": "2024-01-15T10:00:00.000Z",
      "lastLoginAt": "2024-01-20T08:00:00.000Z"
    }
  }
}
```

---

## Update Profile

```http
PATCH /api/v1/auth/me
```

Update current user's profile.

### Request Body

```json
{
  "name": "John Updated",
  "email": "newemail@example.com"
}
```

### Response

```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "email": "newemail@example.com",
      "name": "John Updated"
    }
  }
}
```

---

## Change Password

```http
POST /api/v1/auth/change-password
```

Change the current user's password.

### Request Body

```json
{
  "currentPassword": "oldPassword123",
  "newPassword": "newSecurePassword456"
}
```

### Response

```json
{
  "status": "success",
  "message": "Password changed successfully"
}
```

---

## Token Lifecycle

```
Login/Register
     │
     ▼
┌─────────────┐
│Access Token │ (15 minutes)
└──────┬──────┘
       │ Expires
       ▼
┌──────────────┐
│Refresh Token │ (7 days)
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ POST /refresh│
└──────┬───────┘
       │
       ▼
┌─────────────┐
│New Access   │
│   Token     │
└─────────────┘
```

## Rate Limiting

Authentication endpoints have stricter rate limits:

| Endpoint | Limit | Window |
|----------|-------|--------|
| /login | 10 | 15 minutes |
| /register | 5 | 1 hour |
| /refresh | 30 | 1 hour |

## Security Notes

1. **Passwords** are hashed with bcrypt (12 rounds)
2. **Tokens** use HS256 signing algorithm
3. **Cookies** are HttpOnly to prevent XSS
4. **Refresh tokens** are stored hashed in the database
5. **Login attempts** are rate-limited to prevent brute force
