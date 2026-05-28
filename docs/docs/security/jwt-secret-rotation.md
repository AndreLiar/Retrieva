---
sidebar_position: 6
---

# JWT Secret Rotation Runbook

How to rotate the JWT signing secrets (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`)
with **zero downtime** — no user is forcibly logged out unless you want them to be.

## How rotation works

Tokens are always **signed** with the current/primary secret. **Verification**
tries the primary first, then any secrets listed in `JWT_ACCESS_SECRET_PREVIOUS`
/ `JWT_REFRESH_SECRET_PREVIOUS` (comma-separated). This lets a key change
overlap with in-flight tokens.

| Variable | Purpose |
| --- | --- |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Current signing key (required, min 32 chars) |
| `JWT_ACCESS_SECRET_PREVIOUS` / `JWT_REFRESH_SECRET_PREVIOUS` | Old key(s) still accepted for verification (optional, comma-separated) |

Token lifetimes that bound the rotation window:

- Access token: **15 min** (`JWT_ACCESS_EXPIRY`)
- Refresh token: **7 days** (`JWT_REFRESH_EXPIRY`)

Access and refresh secrets are independent — rotate them together or separately.

## Generate a new secret

```bash
openssl rand -base64 48
```

## Planned (zero-downtime) rotation

> ⚠️ Do **not** just replace `JWT_*_SECRET`. Without the `_PREVIOUS` overlap,
> every currently-issued token instantly fails verification and all users are
> logged out.

1. **Stage the overlap.** Move the current secret to `_PREVIOUS` and set the new
   one as primary, for **both** access and refresh:

   ```dotenv
   JWT_ACCESS_SECRET=<NEW_ACCESS>
   JWT_ACCESS_SECRET_PREVIOUS=<OLD_ACCESS>
   JWT_REFRESH_SECRET=<NEW_REFRESH>
   JWT_REFRESH_SECRET_PREVIOUS=<OLD_REFRESH>
   ```

   Deploy. New tokens are signed with the new keys; tokens already in the wild
   keep verifying against `_PREVIOUS`.

2. **Wait out the longest TTL.** Leave the overlap in place for **at least the
   refresh-token lifetime (7 days)** so every old-key refresh token has either
   expired or been rotated to a new-key one.

3. **Drop the old key.** Remove the `_PREVIOUS` variables and deploy again:

   ```dotenv
   JWT_ACCESS_SECRET=<NEW_ACCESS>
   JWT_REFRESH_SECRET=<NEW_REFRESH>
   # _PREVIOUS removed
   ```

   Rotation complete. No user saw an interruption.

## Emergency rotation (suspected key compromise)

When a secret may be leaked, you **want** to invalidate every existing session
immediately:

1. Set `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` to fresh values and **do not**
   set `_PREVIOUS`.
2. Deploy.

Every existing access and refresh token now fails verification → all users must
log in again. This is the intended, safe behavior under compromise.

## Production secrets

Production/staging secrets are SOPS-encrypted in `backend/.env.production.enc`.
Edit them with:

```bash
SOPS_AGE_KEY_FILE=~/.age/key.txt sops backend/.env.production.enc
```

Add/update the `JWT_*` and `JWT_*_PREVIOUS` keys there, then redeploy.

## Verifying a rotation

- During the overlap window, a session created **before** the rotation should
  still work (its token verifies against `_PREVIOUS`).
- A session created **after** the rotation should work and its token should
  verify against the new primary only.
- Backend logs show no spike in `Invalid access token` / `Invalid refresh token`
  warnings — a spike means the overlap was misconfigured (old key not in
  `_PREVIOUS`).

## Notes

- `_PREVIOUS` accepts a **comma-separated list**, so you can overlap more than
  one historical key if rotations stack up.
- Verification only retries the next key on a **signature mismatch**; expired,
  malformed, or wrong-issuer/audience tokens fail immediately (no behavior change
  when `_PREVIOUS` is unset).
- Implementation: `backend/utils/security/jwt.js`; tests:
  `backend/tests/unittest/jwtRotation.test.js`.
