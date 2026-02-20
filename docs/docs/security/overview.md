---
sidebar_position: 1
---

# Security Overview

The RAG Platform implements multiple security layers to protect user data and ensure safe AI operations.

## Security Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Security Layers                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Layer 0: DevSecOps Pipeline (CI)                                │   │
│  │  • Gitleaks — secret scanning on every push                      │   │
│  │  • Semgrep SAST — OWASP Top 10, nodejs, secrets rulesets         │   │
│  │  • Trivy — dependency CVE scanning (HIGH/CRITICAL)               │   │
│  │  • npm audit — production dependency vulnerability gate          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Layer 1: Network Security                                       │   │
│  │  • HTTPS/TLS encryption                                          │   │
│  │  • CORS policy (allowlist-based)                                 │   │
│  │  • Rate limiting                                                  │   │
│  │  • Helmet security headers                                        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Layer 2: Authentication                                          │   │
│  │  • JWT tokens (access + refresh)                                  │   │
│  │  • HttpOnly cookies                                               │   │
│  │  • Password hashing (bcrypt)                                      │   │
│  │  • Session management                                             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Layer 3: Authorization                                           │   │
│  │  • Role-based access control (RBAC)                              │   │
│  │  • Workspace isolation                                            │   │
│  │  • BOLA protection                                                │   │
│  │  • Permission verification                                        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Layer 4: Data Protection                                         │   │
│  │  • AES-256-GCM encryption at rest (explicit 128-bit auth tag)    │   │
│  │  • Token encryption with key versioning                          │   │
│  │  • Multi-tenant isolation                                         │   │
│  │  • PII masking                                                    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Layer 5: Runtime Guardrails                                      │   │
│  │  • Abuse detection (rate, spam, unusual hours)                   │   │
│  │  • Token usage limits                                            │   │
│  │  • Prompt injection prevention                                    │   │
│  │  • Output sanitization & hallucination detection                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## DevSecOps Pipeline

Security checks run automatically on every push and pull request via GitHub Actions:

| Tool | What it checks | Blocks merge |
|------|---------------|-------------|
| **Gitleaks** | Committed secrets, API keys, credentials in full git history | Yes |
| **Semgrep** | SAST: OWASP Top 10, injection, insecure crypto, secrets patterns | Yes |
| **Trivy** | HIGH/CRITICAL CVEs in npm/pip dependencies with available fixes | Yes |
| **npm audit** | Production dependency vulnerabilities (`--omit=dev`) | Yes |

Config files: `.gitleaks.toml` (secret scan allowlists), `.semgrepignore` (SAST exclusions).

## OWASP LLM Top 10 Mitigations

The platform addresses the [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/):

| # | Vulnerability | Mitigation |
|---|---------------|------------|
| LLM01 | Prompt Injection | XML-delimited user input, instruction isolation |
| LLM02 | Insecure Output | HTML encoding, XSS prevention, sanitization |
| LLM03 | Training Data Poisoning | N/A (using pre-trained models) |
| LLM04 | Model DoS | Timeouts, rate limiting, resource limits |
| LLM05 | Supply Chain | Dependency scanning, local model deployment |
| LLM06 | Sensitive Info Disclosure | PII masking, output scanning |
| LLM07 | Insecure Plugin Design | N/A (no plugins) |
| LLM08 | Excessive Agency | Read-only operations, no autonomous actions |
| LLM09 | Overreliance | Confidence scoring, uncertainty flagging |
| LLM10 | Model Theft | Local deployment, no model export |

## Key Security Features

### Authentication

- JWT tokens with 15-minute expiry
- Refresh tokens with 7-day expiry
- HttpOnly, Secure, SameSite cookies
- Password hashing with bcrypt (12 rounds)
- Login attempt rate limiting

### Authorization

- Role-based access control (RBAC)
- Workspace-level permissions
- BOLA protection on all endpoints
- Permission middleware on sensitive operations

### Data Protection

- AES-256 encryption for Notion tokens
- Tenant isolation at database level
- Mandatory workspace filter on vector queries
- No cross-tenant data access

### LLM Security

- Prompt injection prevention
- Output sanitization
- Hallucination detection
- Confidence thresholds
- PII leak detection

## Security Headers

Configured via Helmet:

```javascript
helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", process.env.CORS_ORIGIN],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: "same-origin" },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: "deny" },
  hsts: { maxAge: 31536000, includeSubDomains: true },
  ieNoOpen: true,
  noSniff: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  xssFilter: true,
})
```

## Audit Logging

All security-relevant events are logged:

```javascript
logger.info('Security event', {
  event: 'login_success',
  userId: user._id,
  ip: req.ip,
  userAgent: req.get('user-agent'),
  timestamp: new Date(),
});
```

Events logged:
- Authentication attempts (success/failure)
- Authorization denials
- Rate limit violations
- Suspicious activity
- Data access patterns
- Admin operations

## Vulnerability Reporting

If you discover a security vulnerability:

1. **Do not** disclose publicly
2. Email security@example.com
3. Include detailed reproduction steps
4. Allow 90 days for remediation

We follow responsible disclosure practices.
