# Retrieva — Customer Playbook

**Your complete guide to DORA compliance, vendor risk management, and AI-powered gap analysis.**

---

## Table of Contents

1. [What is Retrieva?](#1-what-is-retrieva)
2. [Getting Started](#2-getting-started)
   - 2.1 [Create your account](#21-create-your-account)
   - 2.2 [Verify your email](#22-verify-your-email)
   - 2.3 [Set up your organisation](#23-set-up-your-organisation)
3. [Understanding the Dashboard](#3-understanding-the-dashboard)
4. [Core Concept — Vendors & Workspaces](#4-core-concept--vendors--workspaces)
5. [The 5-Step DORA Compliance Workflow](#5-the-5-step-dora-compliance-workflow)
   - Step 1: [Classify your vendor](#step-1-classify-your-vendor)
   - Step 2: [Send a Due Diligence Questionnaire](#step-2-send-a-due-diligence-questionnaire)
   - Step 3: [Run a Gap Analysis](#step-3-run-a-gap-analysis)
   - Step 4: [Contract Review (Art. 30)](#step-4-contract-review-art-30)
   - Step 5: [Set Up Monitoring](#step-5-set-up-monitoring)
6. [Risk Register — Portfolio View](#6-risk-register--portfolio-view)
7. [Ask AI — Intelligent Document Chat](#7-ask-ai--intelligent-document-chat)
8. [Team Management](#8-team-management)
   - 8.1 [Organisation roles](#81-organisation-roles)
   - 8.2 [Workspace roles](#82-workspace-roles)
   - 8.3 [Invite team members](#83-invite-team-members)
9. [Account & Security Settings](#9-account--security-settings)
10. [Billing & Subscription](#10-billing--subscription)
11. [Role Permissions Reference](#11-role-permissions-reference)
12. [Frequently Asked Questions](#12-frequently-asked-questions)

---

## 1. What is Retrieva?

Retrieva is a **DORA compliance assessment platform** built for financial institutions and their ICT risk teams. It helps you:

- **Assess** third-party ICT vendors against DORA Articles 28–30 requirements
- **Analyse gaps** in vendor contracts and security posture using AI
- **Monitor** vendor risk in real time — certifications, contract renewals, annual reviews
- **Generate evidence** for auditors with downloadable gap reports and the EBA RoI Master Template
- **Centralise** all vendor compliance data in one place for your entire team

The platform is powered by **Azure OpenAI** (GPT-4o mini) with a retrieval-augmented generation (RAG) pipeline, meaning every AI answer is grounded in the documents you upload — not hallucinated.

---

## 2. Getting Started

### 2.1 Create your account

1. Navigate to **[retrieva.online](https://retrieva.online)** and click **Get Started** or go directly to `/register`
2. Enter your **full name**, **work email address**, and choose a **strong password**

   Password requirements:
   - Minimum 8 characters
   - At least one uppercase letter
   - At least one lowercase letter
   - At least one number
   - At least one special character

3. Click **Create account** — a verification email will be sent immediately

> **Joining via invitation?** If a colleague sent you an invite link, click it directly. Your email will be pre-filled and you will be added to their organisation automatically after registration.

---

### 2.2 Verify your email

Check your inbox for an email from **noreply@retrieva.online** with the subject **"Verify your email"**.

- Click **Verify Email** in the email
- You will be redirected back to Retrieva and confirmed as verified
- If the email doesn't arrive within 2 minutes, check your spam folder
- You can resend the verification from **Settings → Profile** (60-second cooldown between resends)

> **Important:** Some features require a verified email. We recommend verifying before proceeding.

---

### 2.3 Set up your organisation

On first login, if no organisation exists yet, you will be taken to the **Onboarding** page:

| Field | Description |
|---|---|
| Organisation name | Your company or team name — visible to all members |
| Industry | Select the sector that best describes your business |
| Country | Your primary country of operation (optional) |

Click **Create Organisation** — you will land on the main dashboard as the organisation **Admin**.

---

## 3. Understanding the Dashboard

The main dashboard is built around a **sidebar** on the left that is always visible. Here is what each section contains:

### Compliance

| Item | Route | What it does |
|---|---|---|
| **Risk Register** | `/risk-register` | Portfolio-level view of all vendors, their risk scores, compliance progress, certification status, and contract deadlines |
| **Vendors** | `/workspaces` | Your list of ICT vendors — add, view, and manage individual vendor workspaces |
| **Gap Analysis** | `/assessments` | All DORA gap assessments across every vendor |
| **Questionnaires** | `/questionnaires` | Due diligence questionnaires sent to vendors (Art. 28/30) |

### Intelligence

| Item | Route | What it does |
|---|---|---|
| **Ask AI** | `/chat` | Start a new AI conversation grounded in your uploaded documents |
| **History** | `/conversations` | All previous AI chat sessions — browse, pin, and revisit |

### Bottom

| Item | Route | What it does |
|---|---|---|
| **Settings** | `/settings` | Your profile, team, security, and billing settings |

> **Tip:** The sidebar can be collapsed to icon-only mode by clicking the arrow icon at the top. Hover over any icon to see its label.

---

## 4. Core Concept — Vendors & Workspaces

In Retrieva, every **ICT vendor** is managed inside its own **Workspace**. A workspace is a dedicated compliance environment for one vendor that holds:

- The vendor's classification and contract details
- All assessments and questionnaires run against that vendor
- The vendor's compliance checklist (5-step progress tracker)
- The monitoring dashboard (live status of certs, contracts, reviews)
- The team members who have access to that vendor's data

### Create a new vendor workspace

1. Go to **Vendors** in the sidebar
2. Click **New Vendor** (top right)
3. Fill in:
   - **Vendor name** — the name of the ICT service provider
   - **Industry** — the vendor's sector
   - **Country** — where the vendor is headquartered (optional)
4. Click **Create** — you land on the vendor detail page immediately

You can have as many vendor workspaces as your plan allows.

---

## 5. The 5-Step DORA Compliance Workflow

Every vendor workspace has a **Compliance Checklist** at the top of its detail page. It tracks your progress through 5 mandatory steps required for DORA Article 28/30 compliance.

```
Step 1          Step 2          Step 3          Step 4          Step 5
Classify   →  Questionnaire  →  Gap Analysis  →  Contract Review  →  Monitoring
```

Each step shows its current status:
- **Done** (green check) — completed
- **In Progress** (amber spinner) — work started, not yet complete
- **Pending** (grey circle) — not yet started

---

### Step 1: Classify your vendor

**What it does:** Sets the vendor's criticality tier and service type — the foundation of every DORA risk decision.

**How to complete it:**
1. From the vendor workspace, click **Go to Settings** inside the Step 1 card (or go to the vendor's **Settings** tab)
2. Fill in:

| Field | Options | DORA Relevance |
|---|---|---|
| **Vendor tier** | Critical · Important · Standard | Determines Art. 28(2) obligations |
| **Service type** | Payment processing · Cloud infrastructure · Cybersecurity · Data analytics · etc. | Maps to ICT function categories (Art. 28(3)(a)) |
| **Contract start / end dates** | Date pickers | Feeds the monitoring dashboard |
| **Certifications** | ISO 27001, SOC 2, etc. with expiry dates | Tracked in real time for alerts |
| **Next review date** | Date picker | Triggers annual review monitoring |

3. Click **Save Changes**

> **DORA tip:** Under DORA, Critical and Important vendors require mandatory contractual protections (Art. 30), annual reviews, and testing participation. Classifying correctly ensures the right obligations are surfaced.

---

### Step 2: Send a Due Diligence Questionnaire

**What it does:** Sends a structured Art. 28/30 due diligence questionnaire directly to your vendor's contact. The vendor completes it externally; responses are automatically captured and scored.

**How to complete it:**
1. Go to **Questionnaires** in the sidebar and click **New Questionnaire**, or click **Send Questionnaire** from the Step 2 card
2. Fill in:
   - **Vendor contact email** — the person at the vendor who should complete the form
   - **Framework** — DORA Article 28 or Contract Article 30
3. Click **Send** — the vendor receives a secure link to their unique questionnaire form

**Tracking responses:**
- Go to **Questionnaires** to see status: Draft · Sent · In Progress · Complete · Expired
- Click any row to see full response details and the overall compliance **score (0–100)**
- Completed questionnaires feed into the **Risk Register** score automatically

**Exporting:**
- Click **Export RoI** on a completed questionnaire to download the **EBA Master Template** as an Excel file — ready for regulatory submission

---

### Step 3: Run a Gap Analysis

**What it does:** Uploads ICT vendor documents (policies, reports, audit certificates) and uses AI to identify DORA compliance gaps — missing clauses, partial requirements, and remediation recommendations.

**How to complete it:**
1. Go to **Gap Analysis** in the sidebar and click **New Assessment**, or click **Run Gap Analysis** from the Step 3 card
2. On the new assessment form:
   - **Upload files** — drag and drop or browse (PDFs, Word docs, etc.)
   - **Select framework** — DORA Article 28/29 or Contract Article 30
3. Click **Start Analysis**

**Assessment lifecycle:**

| Status | Meaning |
|---|---|
| **Pending** | Queued for processing |
| **Indexing** | Documents being embedded into the vector database |
| **Analysing** | AI running gap analysis against DORA requirements |
| **Complete** | Results ready to view |
| **Failed** | Processing error — retry or contact support |

> The page auto-refreshes every 5 seconds while an assessment is in progress. Large documents may take several minutes.

**Reading results:**
- **Overall risk level** — Low · Medium · High
- **Gap breakdown** — Missing vs. Partial requirements per DORA domain
- **Remediation recommendations** — AI-generated actions for each gap
- Click **Download Report** to export a PDF summary for audit evidence

---

### Step 4: Contract Review (Art. 30)

**What it does:** Analyses your vendor contract against the **12 mandatory clauses** required by DORA Article 30, identifying which clauses are present, partial, or missing entirely.

**How to complete it:**
1. Click **New Assessment** → select **Contract Article 30** as the framework
2. Upload your vendor contract (PDF or Word)
3. Click **Start Analysis**

**Results view:**
- A **clause scorecard** shows each of the 12 Art. 30 clauses with a status (present / partial / missing)
- Detailed findings for each clause with the exact contract language found (or noted as absent)
- Download the full report as evidence for your internal audit trail

---

### Step 5: Set Up Monitoring

**What it does:** Activates the **Automated Monitoring Dashboard** for the vendor — a real-time signal tracker that alerts you when certifications expire, contracts come up for renewal, annual reviews are due, or assessments go stale.

**How to complete it:**
1. Ensure you have set **certification expiry dates**, **contract end date**, and **next review date** in the vendor's Settings (Step 1)
2. Once these are saved, monitoring activates automatically

**Monitoring dashboard signals:**

| Signal | What it tracks | Alert threshold |
|---|---|---|
| **Certifications** | Expiry dates for ISO 27001, SOC 2, etc. | Red: expired · Amber: <90 days |
| **Contract renewal** | Contract end date | Red: <30 days · Amber: <90 days |
| **Annual review** | Next review date | Red: overdue · Amber: <30 days |
| **Last assessment** | Most recent gap analysis | Amber: >12 months old |

The overall vendor status rolls up to one of three states:
- **Active** — all signals green
- **Attention** — one or more amber signals
- **Action Required** — one or more red signals

---

## 6. Risk Register — Portfolio View

The **Risk Register** (`/risk-register`) gives you a single-page view of your entire ICT vendor portfolio — essential for executive reporting and regulatory audits.

### What you see

Each row is one vendor with the following columns:

| Column | Description |
|---|---|
| **Vendor** | Vendor name |
| **Tier** | Critical / Important / Standard |
| **Service** | ICT service category |
| **DORA Risk** | Aggregated risk level (Low / Medium / High) |
| **Risk Score** | Numerical score (0–100) |
| **Gaps** | Count of missing and partial DORA requirements |
| **Q Score** | Questionnaire compliance score |
| **Contract** | Contract status and days to expiry |
| **Certs** | Certification status with days to expiry |
| **Next Review** | Date of next scheduled review |
| **Compliance** | Progress through the 5-step workflow (e.g. 3/5) |

### Summary cards at the top

- **Total vendors** — count of all vendor workspaces
- **High risk** — vendors with a High risk level
- **Fully compliant** — vendors with all 5 steps complete
- **Expiring certs** — vendors with certifications expiring within 90 days

---

## 7. Ask AI — Intelligent Document Chat

The **Ask AI** feature lets you have a natural language conversation with your compliance documents. Every answer is generated from the documents you have uploaded — with citations showing exactly which document and section was used.

### Starting a conversation

1. Click **Ask AI** in the sidebar — this opens a new, blank conversation
2. Type your question in the message box and press **Enter** or click **Send**
3. The AI retrieves relevant passages from your documents and generates a grounded answer in real time (you will see it stream word by word)

### What to ask

- *"What are the gaps in [vendor]'s ISO 27001 policy?"*
- *"Does the contract with [vendor] include Article 30 audit rights?"*
- *"Summarise the key risks from the latest gap analysis for [vendor]"*
- *"Which vendors have expiring certifications this quarter?"*
- *"What remediation actions were recommended for [vendor]?"*

### Conversation history

- All conversations are automatically saved under **History** (`/conversations`)
- **Pin** important conversations so they appear at the top of your list
- Click any conversation to resume it — the AI retains the full context of the session
- **Bulk delete** old conversations using the multi-select checkbox in the history list

> **Note:** The AI only knows about documents you have uploaded via gap assessments. The more documents you index, the more precise and comprehensive the answers become.

---

## 8. Team Management

### 8.1 Organisation roles

Organisation roles control what a user can do across the entire platform:

| Role | Who it is for | What they can do |
|---|---|---|
| **Admin** | Compliance leads, managers | Full access — manage team, create vendors, run assessments, view all data |
| **Analyst** | ICT risk analysts, junior compliance | Create and run assessments, send questionnaires, view all vendors |
| **Viewer** | Executives, auditors, read-only stakeholders | View assessments and results only — no create or edit |

### 8.2 Workspace roles

Workspace roles control access to a specific vendor workspace:

| Role | What they can do |
|---|---|
| **Owner** | Full control — edit settings, manage members, run all assessments |
| **Member** | Run assessments, send questionnaires, use AI chat |
| **Viewer** | Read-only — view results, risk register, reports |

### 8.3 Invite team members

**To invite someone to your organisation:**
1. Go to **Settings → Team**
2. In the **Invite Member** section, enter their **email address** and select their **role** (Admin / Analyst / Viewer)
3. Click **Send Invite** — they receive an email with a secure join link

**What the invitee sees:**
- If they have an account: clicking the link adds them directly to the organisation
- If they are new: they are taken to the registration page with their email pre-filled, and added to the organisation after registering

**Managing existing members:**
- View all active members and their roles on the **Settings → Team** page
- Change a member's role using the dropdown next to their name
- Remove a member by clicking **Remove** — they lose access immediately

**To add someone to a specific vendor workspace:**
1. Open the vendor workspace → click the **Members** tab
2. Invite by email with a workspace-specific role (Owner / Member / Viewer)

---

## 9. Account & Security Settings

All settings are accessible from **Settings** in the sidebar bottom nav.

### Profile (`/settings`)

| Setting | Description |
|---|---|
| **Name** | Update your display name |
| **Email** | Your login email (read-only — contact support to change) |
| **Email verification** | Shows verified status; button to resend verification email |
| **Email notifications** | Toggle to receive email alerts for assessments and sync events |
| **Sync alerts** | Toggle alerts when vendor data sync events occur |
| **Weekly digest** | Toggle a weekly summary email of your compliance status |

### Security (`/settings/security`)

- **Change password** — Enter your current password, then set a new one
- **Last Login** — Shows the last time your session was active
- **Account Created** — Your registration date
- **Email Verified** — Verification status

> Passwords must meet the same strength requirements as registration (8+ chars, mixed case, number, special character).

### Team (`/settings/team`)

Organisation-wide team management — visible to all users but editable only by **Admins**. See [Section 8](#8-team-management) for details.

---

## 10. Billing & Subscription

Go to **Settings → Billing** to manage your subscription.

From the billing portal you can:
- View your current plan and usage
- Upgrade or downgrade your subscription
- Update payment details
- Download invoices

For billing issues or custom enterprise pricing, contact **support@retrieva.online**.

---

## 11. Role Permissions Reference

| Action | Admin | Analyst | Viewer |
|---|---|---|---|
| Create vendor workspace | ✅ | ✅ | ❌ |
| Edit vendor settings | ✅ | ✅ (own) | ❌ |
| Run gap analysis | ✅ | ✅ | ❌ |
| Send questionnaire | ✅ | ✅ | ❌ |
| View assessments & results | ✅ | ✅ | ✅ |
| View risk register | ✅ | ✅ | ✅ |
| Download reports | ✅ | ✅ | ✅ |
| Use Ask AI | ✅ | ✅ | ❌ |
| View conversation history | ✅ | ✅ | ❌ |
| Invite organisation members | ✅ | ❌ | ❌ |
| Manage member roles | ✅ | ❌ | ❌ |
| Access billing | ✅ | ❌ | ❌ |
| Access admin dashboard | ✅ | ❌ | ❌ |

---

## 12. Frequently Asked Questions

**Q: What file types can I upload for gap analysis?**
PDF and Word documents (.pdf, .docx) are supported. Scanned PDFs without text layers may produce limited results — use text-based PDFs where possible.

**Q: How long does a gap analysis take?**
Typically 2–5 minutes depending on document size and current queue depth. The assessment page auto-refreshes while it is in progress.

**Q: Can the AI see documents from other organisations?**
No. Documents are isolated per organisation and further filtered by workspace during retrieval. The AI only has access to documents you have uploaded within your organisation.

**Q: What is the EBA RoI Master Template?**
The Register of Information (RoI) is the standardised Excel template required by the European Banking Authority for DORA reporting. Retrieva generates a pre-filled version from your questionnaire data. Download it from any completed questionnaire via **Export RoI**.

**Q: Can a vendor complete the questionnaire without a Retrieva account?**
Yes. When you send a questionnaire, the vendor receives a secure unique link. They complete it in a web form — no Retrieva account required.

**Q: How do I remove a vendor workspace?**
Open the vendor workspace → click the **Delete** option (available to workspace Owners and organisation Admins). This permanently removes the workspace and all associated assessments, questionnaires, and documents.

**Q: What happens if an assessment fails?**
A Failed status means a processing error occurred (e.g. unreadable file, service timeout). Check the document format and try again. If the issue persists, contact support with the assessment ID.

**Q: Is my data encrypted?**
Yes. All data is encrypted in transit (TLS 1.2+) and at rest. Production secrets are encrypted using SOPS with age encryption. The platform is hosted on DigitalOcean infrastructure in the Frankfurt region (fra1).

**Q: How do I contact support?**
Email **support@retrieva.online** with a description of your issue, your organisation name, and any relevant assessment or vendor IDs.

---

*Retrieva — Built for DORA. Built for your team.*
*Last updated: March 2026 · [retrieva.online](https://retrieva.online)*
