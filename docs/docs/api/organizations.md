---
sidebar_position: 11
---

# Organizations API

Organizations are the top-level entity in the three-tier hierarchy:

```
Organization
├── OrganizationMember  (org-admin | billing-admin | auditor | member)
└── NotionWorkspace.organizationId  (optional link)
    └── WorkspaceMember  (owner | member | viewer)
```

All endpoints require authentication (`Authorization: Bearer <token>` or the `accessToken` cookie).

---

## Organization CRUD

### Create Organization

```http
POST /api/v1/organizations
```

**Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✓ | Max 100 chars |
| `description` | string | – | Max 500 chars |
| `logoUrl` | string | – | URL to logo image |

**Response 201**

```json
{
  "status": "success",
  "data": {
    "organization": {
      "id": "...",
      "name": "Acme Corp",
      "slug": "acme-corp",
      "plan": "free",
      "status": "active",
      "ownerId": "...",
      "settings": {
        "maxWorkspaces": 5,
        "maxMembers": 10,
        "allowMembersToCreateWorkspaces": false
      }
    }
  }
}
```

The caller is automatically added as an `org-admin` member.

---

### List My Organizations

```http
GET /api/v1/organizations
```

Returns all organizations the caller is an active member of.

**Response 200**

```json
{
  "status": "success",
  "data": {
    "organizations": [
      { "org": { ... }, "role": "org-admin" }
    ]
  }
}
```

---

### Get Organization

```http
GET /api/v1/organizations/:id
```

Requires active membership.

**Response 200** includes `memberCount` and `workspaceCount`.

---

### Update Organization

```http
PATCH /api/v1/organizations/:id
```

Requires `org-admin` role.

**Body** (all fields optional)

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Organization name (slug re-derived) |
| `description` | string | |
| `logoUrl` | string | |
| `settings.maxWorkspaces` | number | |
| `settings.maxMembers` | number | |
| `settings.allowMembersToCreateWorkspaces` | boolean | |

---

### Delete Organization

```http
DELETE /api/v1/organizations/:id
```

Requires owner (`ownerId === caller`). Removes all members and unlinks all workspaces.

---

## Member Management

### List Members

```http
GET /api/v1/organizations/:id/members
```

Requires active membership. Returns all non-revoked members with populated user info.

---

### Invite Member

```http
POST /api/v1/organizations/:id/invite
```

Requires `org-admin`. The invited user must already have an account.

**Body**

| Field | Type | Values |
|-------|------|--------|
| `email` | string | Registered user's email |
| `role` | string | `org-admin` \| `billing-admin` \| `auditor` \| `member` |

Enforces `settings.maxMembers` seat limit. Sends invitation email via Resend.

---

### Update Member Role

```http
PATCH /api/v1/organizations/:id/members/:memberId
```

Requires `org-admin`. Cannot change the owner's role.

**Body**

```json
{ "role": "auditor" }
```

---

### Remove Member

```http
DELETE /api/v1/organizations/:id/members/:memberId
```

Requires `org-admin`. Cannot remove the organization owner. Sets status to `revoked`.

---

## Workspace Linking

### List Linked Workspaces

```http
GET /api/v1/organizations/:id/workspaces
```

Returns all `NotionWorkspace` documents with `organizationId` set to this org.

---

### Link Workspace

```http
POST /api/v1/organizations/:id/workspaces
```

Requires `org-admin`.

**Body**

```json
{ "workspaceId": "<NotionWorkspace._id>" }
```

The workspace must belong to a user who is already an org member. Enforces `settings.maxWorkspaces`.

---

### Unlink Workspace

```http
DELETE /api/v1/organizations/:id/workspaces/:wsId
```

Requires `org-admin`. Sets `organizationId` to null on the workspace (non-destructive).

---

## Roles Reference

| Role | Description |
|------|-------------|
| `org-admin` | Full org management: invite members, link workspaces, update settings |
| `billing-admin` | Informational role; reserved for future billing features |
| `auditor` | Informational role; reserved for future audit/compliance features |
| `member` | Read access; can view the org and its workspaces |

The org creator is always an `org-admin`. Only the `ownerId` user can delete the organization.
