---
sidebar_position: 6
---

# Workspaces API

Manage workspaces and team members.

## List Workspaces

```http
GET /api/v1/workspaces
```

Get all workspaces the user has access to.

### Response

```json
{
  "status": "success",
  "data": {
    "workspaces": [
      {
        "id": "507f1f77bcf86cd799439011",
        "workspaceName": "Engineering Team",
        "workspaceId": "notion-workspace-uuid",
        "syncStatus": "active",
        "myRole": "owner",
        "permissions": {
          "canQuery": true,
          "canViewSources": true,
          "canInvite": true,
          "canManageSync": true,
          "canEditSettings": true
        },
        "memberCount": 5,
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

---

## Get Workspace

```http
GET /api/v1/workspaces/:id
```

Get workspace details.

### Response

```json
{
  "status": "success",
  "data": {
    "workspace": {
      "id": "507f1f77bcf86cd799439011",
      "workspaceName": "Engineering Team",
      "workspaceId": "notion-workspace-uuid",
      "syncStatus": "active",
      "owner": {
        "id": "507f1f77bcf86cd799439012",
        "name": "John Doe",
        "email": "john@example.com"
      },
      "members": [
        {
          "user": {
            "id": "507f1f77bcf86cd799439013",
            "name": "Jane Smith",
            "email": "jane@example.com"
          },
          "role": "member",
          "permissions": {
            "canQuery": true,
            "canViewSources": true,
            "canInvite": false
          },
          "status": "active",
          "joinedAt": "2024-01-05T00:00:00.000Z"
        }
      ],
      "stats": {
        "totalPages": 150,
        "totalDatabases": 5,
        "totalDocuments": 155
      },
      "syncSchedule": {
        "enabled": true,
        "intervalHours": 24
      },
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

---

## Update Workspace

```http
PATCH /api/v1/workspaces/:id
```

Update workspace settings (owner only).

### Request Body

```json
{
  "workspaceName": "Updated Name",
  "syncSchedule": {
    "enabled": true,
    "intervalHours": 12
  }
}
```

### Response

```json
{
  "status": "success",
  "data": {
    "workspace": {
      "id": "507f1f77bcf86cd799439011",
      "workspaceName": "Updated Name"
    }
  }
}
```

---

## Delete Workspace

```http
DELETE /api/v1/workspaces/:id
```

Delete workspace and all associated data (owner only).

### Response

```json
{
  "status": "success",
  "message": "Workspace deleted successfully"
}
```

---

## Add Member

```http
POST /api/v1/workspaces/:id/members
```

Invite a user to the workspace.

### Request Body

```json
{
  "email": "newmember@example.com",
  "role": "member",
  "permissions": {
    "canQuery": true,
    "canViewSources": true,
    "canInvite": false
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | Yes | User's email |
| role | string | No | owner, admin, member, viewer |
| permissions | object | No | Custom permissions |

### Response

```json
{
  "status": "success",
  "message": "Member added successfully",
  "data": {
    "member": {
      "user": {
        "id": "507f1f77bcf86cd799439014",
        "name": "New Member",
        "email": "newmember@example.com"
      },
      "role": "member",
      "status": "active"
    }
  }
}
```

---

## Update Member

```http
PATCH /api/v1/workspaces/:id/members/:userId
```

Update member's role or permissions.

### Request Body

```json
{
  "role": "admin",
  "permissions": {
    "canInvite": true,
    "canManageSync": true
  }
}
```

### Response

```json
{
  "status": "success",
  "data": {
    "member": {
      "role": "admin",
      "permissions": {
        "canQuery": true,
        "canViewSources": true,
        "canInvite": true,
        "canManageSync": true
      }
    }
  }
}
```

---

## Remove Member

```http
DELETE /api/v1/workspaces/:id/members/:userId
```

Remove a member from the workspace.

### Response

```json
{
  "status": "success",
  "message": "Member removed successfully"
}
```

---

## Leave Workspace

```http
POST /api/v1/workspaces/:id/leave
```

Leave a workspace (non-owners only).

### Response

```json
{
  "status": "success",
  "message": "Successfully left workspace"
}
```

---

## Transfer Ownership

```http
POST /api/v1/workspaces/:id/transfer
```

Transfer ownership to another member (owner only).

### Request Body

```json
{
  "newOwnerId": "507f1f77bcf86cd799439013"
}
```

### Response

```json
{
  "status": "success",
  "message": "Ownership transferred successfully"
}
```

---

## Role Permissions Matrix

| Permission | Owner | Admin | Member | Viewer |
|------------|-------|-------|--------|--------|
| canQuery | ✅ | ✅ | ✅ | ✅ |
| canViewSources | ✅ | ✅ | ✅ | ❌ |
| canInvite | ✅ | ✅ | ❌ | ❌ |
| canManageSync | ✅ | ✅ | ❌ | ❌ |
| canEditSettings | ✅ | ❌ | ❌ | ❌ |
| canDeleteWorkspace | ✅ | ❌ | ❌ | ❌ |
