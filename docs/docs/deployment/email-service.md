---
sidebar_position: 5
---

# Email Service

The platform sends transactional emails using the **Resend HTTP API**. This page covers setup, DNS configuration, and troubleshooting.

## Why Resend (not SMTP)

DigitalOcean blocks outbound traffic on SMTP ports (25, 465, 587) for all droplets. This means traditional SMTP libraries like Nodemailer cannot deliver email from production.

**Resend** solves this by providing an HTTP API over port 443 (HTTPS), which is never blocked. The migration from Nodemailer to Resend was done for this reason.

## Setup

### 1. Create a Resend Account

1. Sign up at [resend.com](https://resend.com)
2. Navigate to **API Keys** and create a new key
3. Copy the key — it starts with `re_`

### 2. Configure Environment Variables

```bash
# Required for email to work
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Optional (have defaults)
SMTP_FROM_NAME=RAG Platform
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

| Variable | Default | Description |
|----------|---------|-------------|
| `RESEND_API_KEY` | - | Resend API key (required) |
| `SMTP_FROM_NAME` | `RAG Platform` | Display name in the "From" field |
| `RESEND_FROM_EMAIL` | `noreply@retrieva.online` | Sender email (must match a verified Resend domain) |

:::note
If `RESEND_API_KEY` is not set, the service gracefully degrades — emails are skipped with a warning log. This means email is optional for local development.
:::

## Domain Verification

To send from your own domain (instead of Resend's shared domain), you must verify it with DNS records.

### Required DNS Records

After adding your domain in the Resend dashboard, you'll be given records to create. For the `retrieva.online` domain, these are:

| Type | Name | Value | Purpose |
|------|------|-------|---------|
| TXT | `resend._domainkey.retrieva.online` | `p=MIGfMA0GCSq...` | DKIM signature (record 1) |
| TXT | `resend2._domainkey.retrieva.online` | `p=MIGfMA0GCSq...` | DKIM signature (record 2) |
| TXT | `resend3._domainkey.retrieva.online` | `p=MIGfMA0GCSq...` | DKIM signature (record 3) |
| MX | `send.retrieva.online` | `feedback-smtp.us-east-1.amazonses.com` | SPF return path |
| TXT | `send.retrieva.online` | `v=spf1 include:amazonses.com ~all` | SPF authorization |
| TXT | `_dmarc.retrieva.online` | `v=DMARC1; p=none;` | DMARC policy |

### DNS Management

Even if your domain is registered at a different registrar (e.g., Namecheap), DNS can be managed at **DigitalOcean** by pointing the domain's nameservers to:

```
ns1.digitalocean.com
ns2.digitalocean.com
ns3.digitalocean.com
```

Then add the DNS records in the DigitalOcean control panel under **Networking > Domains**.

:::warning
DNS propagation can take up to 48 hours. Resend will show the domain as "Pending" until all records are verified.
:::

## Email Templates

The email service sends 4 types of branded HTML emails:

| Method | Trigger | Template |
|--------|---------|----------|
| `sendEmailVerification` | User registration | Verification link (24h expiry) |
| `sendPasswordResetEmail` | Forgot password | Reset link (1h expiry) |
| `sendWelcomeEmail` | Account created | Onboarding steps + dashboard link |
| `sendWorkspaceInvitation` | Member invited | Workspace details + join link |

All templates use inline CSS for email client compatibility and share a consistent branded header with gradient styling.

## Integration Points

The email service is called from these locations in the codebase:

| Caller | Email Sent |
|--------|------------|
| `controllers/authController.js` | Verification email on registration, password reset email |
| `controllers/workspaceMemberController.js` | Workspace invitation email |
| `services/notificationService.js` | Notification emails (sync failures, system alerts) |

### Notification Service Integration

The `notificationService` uses `emailService.sendEmail()` as a secondary delivery channel. When a notification is created:

1. It's always persisted in MongoDB
2. If the user is online, it's delivered via WebSocket
3. If the user has email enabled for that notification type **and** the priority is not LOW, an email is also sent

## Production Secrets

Email secrets are stored in a separate SOPS-encrypted file:

```
backend/.env.resend.production.enc
```

During deployment, the CD workflow decrypts and appends it to the main `.env`:

```bash
SOPS_AGE_KEY_FILE=~/.age/key.txt sops --decrypt \
  --input-type dotenv --output-type dotenv \
  backend/.env.resend.production.enc >> backend/.env
```

See [CI/CD Pipeline](./ci-cd.md) for the full secrets management flow.

## Health Check

The backend health endpoint at `GET /api/v1/health` includes email service status:

```json
{
  "status": "success",
  "data": {
    "status": "up",
    "email": {
      "configured": true
    }
  }
}
```

`email.configured` will be `false` if `RESEND_API_KEY` is not set.

## Troubleshooting

### Domain Not Verified

**Symptom:** Resend dashboard shows domain as "Pending".

**Fix:**
1. Double-check all 6 DNS records are created in DigitalOcean
2. Use `dig` to verify records have propagated:
   ```bash
   dig TXT resend._domainkey.retrieva.online
   dig MX send.retrieva.online
   dig TXT _dmarc.retrieva.online
   ```
3. Wait up to 48 hours for full propagation
4. Click "Verify" again in the Resend dashboard

### Emails Not Sending (503 Error)

**Symptom:** Logs show `Email not sent - Resend client not configured`.

**Fix:** Ensure `RESEND_API_KEY` is set in the environment. Check that the encrypted secrets file was properly decrypted during deployment:

```bash
# On the production server
grep RESEND_API_KEY /opt/rag/backend/.env
```

### Emails Sent But Not Received

**Symptom:** Resend API returns success but recipient never gets the email.

**Fix:**
1. Check the Resend dashboard **Logs** tab for delivery status
2. Verify the sender domain is fully verified (not "Pending")
3. Check the recipient's spam folder
4. Ensure `RESEND_FROM_EMAIL` matches the verified domain

### Testing Email Locally

To test email sending in local development:

1. Set `RESEND_API_KEY` in your `.env` (use a test API key from Resend)
2. Send a test request that triggers email (e.g., password reset)
3. Check backend logs for `Email sent successfully` with a `messageId`
