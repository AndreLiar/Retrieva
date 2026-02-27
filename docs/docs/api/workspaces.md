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

## Export Register of Information (RoI)

```http
GET /api/v1/workspaces/roi-export
```

Generates and downloads an EBA-compliant DORA Article 28(3) Register of Information as an XLSX file. The workbook covers **all workspaces** the authenticated user has access to.

### Response

```
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="DORA_Register_of_Information_2026-02-27.xlsx"
```

Binary XLSX buffer — the browser triggers an automatic file download.

### Workbook sheets

| Sheet | Content |
|-------|---------|
| **RT.01.01 Summary** | Institution name, report date, vendor counts by criticality tier |
| **RT.02.01 ICT Providers** | One row per vendor: country, service type, contract dates, criticality tier, questionnaire score, assessment risk, next review date |
| **RT.03.01 Certifications** | One row per certification per vendor (type, valid until, status) |
| **RT.04.01 Gap Summary** | One row per gap from each vendor's latest complete DORA assessment |

### Notes

- Requires authentication; no workspace ID parameter — all accessible workspaces are included.
- Uses the latest **complete** assessment and latest **complete** questionnaire per workspace.
- The institution name in RT.01.01 is configured via the `INSTITUTION_NAME` environment variable (default: `Financial Entity`).
- Timeout: allow at least 60 seconds for large portfolios.

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
