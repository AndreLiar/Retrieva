---
sidebar_position: 5
---

# Organizations API

The Organizations API implements the **organization-first B2B onboarding model**. A Chief Risk Officer (or any first user) creates a company account ("HDI Global SE"), then invites their team via email. All org members automatically see every vendor workspace scoped to that organization — no per-workspace invitation is needed.

Base path: `/api/v1/organizations`

---

## Endpoints

### `GET /invite-info` — Public

Retrieves human-readable invite metadata without requiring authentication. Used by the `/join` page to show the org name and inviter before the user registers.

**Auth:** None required

**Query params:**

| Param | Required | Description |
|-------|----------|-------------|
| `token` | yes | Raw invite token from the invitation email URL |

**Response 200:**

```json
{
  "status": "success",
  "data": {
    "organizationName": "HDI Global SE",
    "inviterName": "Maria Schmidt",
    "role": "analyst",
    "email": "thomas@hdi.de"
  }
}
```

**Errors:**

| Code | Reason |
|------|--------|
| 400 | Token missing or expired |
| 404 | Token not found |

---

### `POST /` — Create Organization

Creates a new organization and sets the caller as its first `org_admin`. Updates `user.organizationId`.

**Auth:** Bearer token required

**Request body:**

```json
{
  "name": "HDI Global SE",
  "industry": "insurance",
  "country": "Germany"
}
```

| Field | Type | Required | Values |
|-------|------|----------|--------|
| `name` | string | yes | max 100 chars |
| `industry` | string | yes | `insurance`, `banking`, `investment`, `payments`, `other` |
| `country` | string | no | free text, max 100 chars |

**Response 201:**

```json
{
  "status": "success",
  "message": "Organization created",
  "data": {
    "organization": {
      "id": "64abc...",
      "name": "HDI Global SE",
      "industry": "insurance",
      "country": "Germany"
    }
  }
}
```

**Errors:**

| Code | Reason |
|------|--------|
| 400 | Validation error (name missing, invalid industry) |
| 409 | Caller is already a member of another organization |

---

### `GET /me` — Get My Organization

Returns the caller's organization and their role within it.

**Auth:** Bearer token required

**Response 200:**

```json
{
  "status": "success",
  "data": {
    "organization": {
      "id": "64abc...",
      "name": "HDI Global SE",
      "industry": "insurance",
      "country": "Germany"
    },
    "role": "org_admin"
  }
}
```

`organization` is `null` if the user has not joined an organization yet.

---

### `POST /invite` — Invite Team Member

Sends an invitation email to a new or existing user. The email contains a `/join?token=XXX` link valid for 7 days.

Re-inviting a `pending` member refreshes the token and resends the email (idempotent). Inviting an already-`active` member returns a 409.

**Auth:** Bearer token required; caller must be `org_admin`

**Request body:**

```json
{
  "email": "thomas@hdi.de",
  "role": "analyst"
}
```

| Field | Type | Required | Values |
|-------|------|----------|--------|
| `email` | string | yes | valid email |
| `role` | string | yes | `org_admin`, `analyst`, `viewer` |

**Response 201:**

```json
{
  "status": "success",
  "message": "Invitation sent",
  "data": {
    "member": {
      "id": "64def...",
      "email": "thomas@hdi.de",
      "role": "analyst",
      "status": "pending"
    }
  }
}
```

**Errors:**

| Code | Reason |
|------|--------|
| 400 | Missing or invalid fields |
| 403 | Caller is not an `org_admin` |
| 409 | Email is already an active member |

---

### `POST /accept-invite` — Accept Invitation

Called by an **authenticated** user to join an organization using their invite token. Updates `user.organizationId` and activates the membership.

**Auth:** Bearer token required (user must be registered and logged in)

**Request body:**

```json
{
  "token": "abc123rawtoken..."
}
```

**Response 200:**

```json
{
  "status": "success",
  "message": "Invitation accepted"
}
```

After accepting, the frontend should call `GET /api/v1/auth/me` (or `fetchUser()`) to refresh the auth store with the updated `organizationId` and `organization` fields.

**Errors:**

| Code | Reason |
|------|--------|
| 400 | Token missing, expired, or email mismatch |
| 409 | User is already a member of another organization |

---

### `GET /members` — List Members

Returns all non-revoked members of the caller's organization.

**Auth:** Bearer token required; caller must be an active member

**Response 200:**

```json
{
  "status": "success",
  "data": {
    "members": [
      {
        "id": "64def...",
        "email": "maria@hdi.de",
        "role": "org_admin",
        "status": "active",
        "joinedAt": "2026-02-01T10:00:00.000Z",
        "user": { "id": "64xyz...", "name": "Maria Schmidt", "email": "maria@hdi.de" }
      },
      {
        "id": "64ghi...",
        "email": "thomas@hdi.de",
        "role": "analyst",
        "status": "pending",
        "user": null
      }
    ]
  }
}
```

`user` is `null` for pending members who haven't accepted the invite yet.

---

### `DELETE /members/:memberId` — Remove Member

Revokes a member's access to the organization. Sets their membership status to `revoked`.

**Auth:** Bearer token required; caller must be `org_admin`

**URL params:** `memberId` — the `OrganizationMember._id`

**Response 200:**

```json
{
  "status": "success",
  "message": "Member removed"
}
```

**Errors:**

| Code | Reason |
|------|--------|
| 400 | Cannot remove yourself if you are the last `org_admin` |
| 403 | Caller is not an `org_admin` |
| 404 | Member not found in caller's organization |

---

## Onboarding Flows

### Scenario A — CRO creates the organization

```
1. Maria registers at /register (no invite token in URL)
   → POST /auth/register → { needsOrganization: true }
   → Frontend redirects to /onboarding

2. Maria fills "HDI Global SE", Insurance, Germany
   → POST /organizations → org created, user.organizationId set
   → fetchUser() re-fetches /auth/me
   → Frontend redirects to /assessments

3. Sidebar now shows "HDI Global SE" above the workspace switcher.

4. Maria invites Thomas: POST /organizations/invite { email, role }
   → Email sent: "Maria invited you to join HDI Global SE on Retrieva"
   → Link: https://retrieva.online/join?token=<rawToken>
```

### Scenario B — Team member accepts invite

```
1. Thomas clicks the invite email link → /join?token=XXX
   → GET /organizations/invite-info?token=XXX (public)
   → Page shows: "Maria invited you to join HDI Global SE as Analyst"

2. Thomas is not logged in → redirect to /register?token=XXX&email=thomas@hdi.de
   → Email field is pre-filled and locked on the register page

3. Thomas completes registration:
   → POST /auth/register { email, password, name, inviteToken: "XXX" }
   → Backend finds token, validates email matches, activates membership,
     sets user.organizationId
   → Returns { needsOrganization: false }
   → Frontend redirects to /assessments (skips /onboarding)

4. Thomas sees all of HDI Global SE's vendor workspaces immediately.
```

---

## Role Mapping

Org roles are mapped to workspace-level permissions when `getMyWorkspaces` is called:

| Org role | Workspace role | canQuery | canViewSources | canInvite |
|----------|---------------|----------|----------------|-----------|
| `org_admin` | `owner` | ✓ | ✓ | ✓ |
| `analyst` | `member` | ✓ | ✓ | ✗ |
| `viewer` | `viewer` | ✓ | ✓ | ✗ |
