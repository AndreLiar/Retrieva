import { QuestionnaireTemplate } from '../models/QuestionnaireTemplate.js';
import logger from '../config/logger.js';

const SEED_VERSION = '1.2';

export const DORA_QUESTIONS = [
  // ── ICT Governance ──────────────────────────────────────────────────────────
  {
    id: 'q01',
    doraArticle: 'Art.28(1)',
    category: 'ICT Governance',
    text: 'Describe your ICT risk management framework and governance structure. Who has ultimate accountability for ICT risk, and how does it escalate to board level?',
    hint: 'Include your governance committee structure, reporting lines, and how ICT risk is integrated into enterprise risk management.',
  },
  {
    id: 'q02',
    doraArticle: 'Art.28(2)',
    category: 'ICT Governance',
    text: 'Do you maintain a complete and up-to-date inventory of ICT assets (hardware, software, data, and network components) that support the services you deliver to us? How is this inventory kept current?',
    hint: 'Describe your asset management process, tooling used, and how frequently the inventory is reviewed and updated.',
  },

  // ── Security Controls ────────────────────────────────────────────────────────
  {
    id: 'q03',
    doraArticle: 'Art.9(2)',
    category: 'Security Controls',
    text: 'Describe your information security policies covering access control, data encryption (at rest and in transit), and network security. When were these policies last reviewed and approved?',
    hint: 'Reference specific standards (ISO 27001, SOC 2, etc.) where applicable. Include encryption standards and key management practices.',
  },
  {
    id: 'q04',
    doraArticle: 'Art.9(3)',
    category: 'Security Controls',
    text: 'How do you manage privileged access to systems that support our services? Describe your PAM controls, monitoring of privileged sessions, and review cycles for privileged accounts.',
    hint: 'Include details on just-in-time access, session recording, and how you detect and respond to privileged access anomalies.',
  },
  {
    id: 'q05',
    doraArticle: 'Art.9(4)',
    category: 'Security Controls',
    text: 'Describe your vulnerability and patch management programme. What are your SLA targets for patching critical, high, and medium vulnerabilities in systems supporting our services?',
    hint: 'Include your scanning frequency, exception process, and evidence of patch compliance metrics.',
  },
  {
    id: 'q21',
    doraArticle: 'Art.9(2)',
    category: 'Security Controls',
    text: 'Do you hold an ISO 27001 certification and/or a SOC 2 Type II report covering the services you deliver to us? If yes, please provide the certification body, scope, and most recent certificate or report date.',
    hint: 'Provide the certificate number, issuing body (e.g. BSI, Bureau Veritas), coverage scope, and expiry date. If you hold both, list each. If neither, describe the compensating controls in place.',
  },
  {
    id: 'q22',
    doraArticle: 'Art.9(2)',
    category: 'Security Controls',
    text: 'Is multi-factor authentication (MFA) enforced for all user and administrator access to systems that process or store our data — including remote access, cloud management consoles, and any privileged interfaces?',
    hint: 'Specify MFA method (TOTP, hardware token, push notification) and confirm whether MFA is enforced without exception or if there are policy bypass scenarios.',
  },
  {
    id: 'q23',
    doraArticle: 'Art.9(2)',
    category: 'Security Controls',
    text: 'Do you implement role-based access control (RBAC) for systems supporting our services? How are roles defined, assigned, reviewed, and revoked — particularly for joiners, movers, and leavers?',
    hint: 'Include the frequency of access reviews, who approves role assignments, and how you handle emergency access grants.',
  },
  {
    id: 'q24',
    doraArticle: 'Art.9(4)',
    category: 'Security Controls',
    text: 'Describe your security logging and monitoring capabilities for systems supporting our services. Are all access events, administrative actions, and anomalous activity logged? What is your log retention period and how are logs protected from tampering?',
    hint: 'Include your SIEM tooling, log retention policy (minimum 12 months recommended under DORA), alerting thresholds, and any third-party SOC involvement.',
  },

  // ── Incident Management ──────────────────────────────────────────────────────
  {
    id: 'q06',
    doraArticle: 'Art.17(1)',
    category: 'Incident Management',
    text: 'Describe your ICT incident detection and response process. Within what timeframe do you notify clients of incidents that affect their services?',
    hint: 'Include your detection tooling, severity classification matrix, escalation procedures, and contractual/regulatory notification obligations.',
  },
  {
    id: 'q07',
    doraArticle: 'Art.19(1)',
    category: 'Incident Management',
    text: 'What are your obligations and timelines for notifying affected parties — including your clients and regulators — in the event of a major ICT incident?',
    hint: 'Reference your incident communication plan, templates, and who has authority to trigger formal notifications.',
  },
  {
    id: 'q08',
    doraArticle: 'Art.20',
    category: 'Incident Management',
    text: 'Describe your post-incident review process. How do you share lessons learned with affected clients, and how do you track remediation of root causes?',
    hint: 'Include the format of post-incident reports (PIRs), typical delivery timelines, and how corrective actions are tracked to closure.',
  },

  // ── Business Continuity ──────────────────────────────────────────────────────
  {
    id: 'q09',
    doraArticle: 'Art.11(1)',
    category: 'Business Continuity',
    text: 'Do you maintain a Business Continuity Plan (BCP) covering the ICT services you deliver to us? When was it last tested, and what were the results?',
    hint: 'Include test type (tabletop, simulation, full failover), date of last test, outcomes, and any gaps identified and remediated.',
  },
  {
    id: 'q10',
    doraArticle: 'Art.11(4)',
    category: 'Business Continuity',
    text: 'What are the Recovery Time Objective (RTO) and Recovery Point Objective (RPO) for the services you deliver to us? Are these contractually committed?',
    hint: 'Provide specific RTO/RPO figures per service tier if applicable, and indicate whether these are tested and evidenced.',
  },
  {
    id: 'q11',
    doraArticle: 'Art.12(1)',
    category: 'Business Continuity',
    text: 'Describe your backup procedures for data and systems supporting our services. Where are backups stored geographically, and how is redundancy achieved?',
    hint: 'Include backup frequency, retention periods, geographic separation, encryption of backups, and restoration test frequency.',
  },

  // ── Audit Rights ─────────────────────────────────────────────────────────────
  {
    id: 'q12',
    doraArticle: 'Art.30(3)(c)',
    category: 'Audit Rights',
    text: 'Do you accept our right to conduct audits and on-site inspections of systems supporting our services? Describe your process for accommodating such requests.',
    hint: 'Include notice periods required, scope of access granted, and whether you accept third-party auditors appointed by us.',
  },
  {
    id: 'q13',
    doraArticle: 'Art.25',
    category: 'Audit Rights',
    text: 'How frequently do you conduct penetration testing and ICT resilience testing on systems supporting our services? What is the scope, and are results shared with clients?',
    hint: 'Include frequency (internal and third-party), scope, methodology, and your policy for sharing executive summaries or remediation evidence.',
  },

  // ── Subcontracting ───────────────────────────────────────────────────────────
  {
    id: 'q14',
    doraArticle: 'Art.28(2)(e)',
    category: 'Subcontracting',
    text: 'Please provide a list of material subcontractors involved in delivering services to us, including the jurisdictions in which they operate.',
    hint: 'Material subcontractors are those whose failure could impair your ability to deliver services to us. Include country of incorporation and data processing location.',
  },
  {
    id: 'q15',
    doraArticle: 'Art.30(2)(e)',
    category: 'Subcontracting',
    text: 'How do you conduct due diligence on material subcontractors before onboarding and on an ongoing basis? How do you monitor their ICT and security performance?',
    hint: 'Include your subcontractor assessment process, monitoring frequency, and how you manage subcontractor incidents that affect your clients.',
  },
  {
    id: 'q25',
    doraArticle: 'Art.28(2)(e)',
    category: 'Subcontracting',
    text: 'Do you use hyperscale cloud infrastructure providers (such as Amazon Web Services, Microsoft Azure, or Google Cloud Platform) to deliver any part of the services provided to us? If yes, which providers, in which regions, and for which service components?',
    hint: 'Identify which services run on which cloud, the specific regions (e.g. eu-west-1, germanywestcentral), and whether data sovereignty commitments apply. Note any multi-cloud or hybrid arrangements.',
  },

  // ── Data Governance ──────────────────────────────────────────────────────────
  {
    id: 'q16',
    doraArticle: 'Art.30(2)(b)',
    category: 'Data Governance',
    text: 'In which countries or regions is our data processed and stored? Has this changed in the past 12 months, and will you notify us of future changes?',
    hint: 'Include all processing locations (primary and backup), and identify any transfers to jurisdictions outside the EEA.',
  },
  {
    id: 'q17',
    doraArticle: 'Art.30(2)(c)',
    category: 'Data Governance',
    text: 'What controls do you implement to ensure the availability, integrity, and confidentiality of our data? How do you detect and respond to data integrity issues?',
    hint: 'Include encryption standards, access controls, integrity monitoring, and any relevant certifications (ISO 27001, SOC 2 Type II).',
  },
  {
    id: 'q18',
    doraArticle: 'Art.30(2)(d)',
    category: 'Data Governance',
    text: 'What is your process for data portability, return of our data, and secure deletion upon contract termination? What formats and timelines apply?',
    hint: 'Include data export formats, delivery timeline, confirmation of deletion, and any third-party certification of secure disposal.',
  },
  {
    id: 'q26',
    doraArticle: 'Art.30(2)(b)',
    category: 'Data Governance',
    text: 'Are you GDPR compliant? Do you have a signed Data Processing Agreement (DPA) in place or are you willing to execute one? Have you appointed a Data Protection Officer (DPO)?',
    hint: 'Confirm GDPR compliance status, DPA availability (or link to your standard DPA), and DPO contact details. Reference any relevant supervisory authority registration.',
  },
  {
    id: 'q27',
    doraArticle: 'Art.30(2)(b)',
    category: 'Data Governance',
    text: 'For any transfers of our data outside the European Economic Area (EEA), what legal transfer mechanisms do you rely on — for example, Standard Contractual Clauses (SCCs), Adequacy Decisions, or Binding Corporate Rules?',
    hint: 'Identify the specific mechanism per destination country, confirm SCCs are up-to-date (2021 EU SCCs), and note any transfer impact assessments (TIAs) conducted.',
  },

  // ── Exit Planning ────────────────────────────────────────────────────────────
  {
    id: 'q19',
    doraArticle: 'Art.30(2)(h)',
    category: 'Exit Planning',
    text: 'Describe the exit assistance and transition support you would provide to enable us to migrate to an alternative provider. What is included and for how long?',
    hint: 'Include transition planning support, data migration assistance, knowledge transfer, and any costs associated with exit support.',
  },

  // ── Regulatory History ───────────────────────────────────────────────────────
  {
    id: 'q20',
    doraArticle: 'Art.28(8)',
    category: 'Regulatory History',
    text: 'Have you experienced any material ICT incidents or been subject to regulatory actions, sanctions, or significant audit findings in the past 24 months? If so, please summarise.',
    hint: 'This includes ICT-related regulatory investigations, fines, enforcement notices, or material incidents disclosed to regulators.',
  },

  // ── Concentration Risk ───────────────────────────────────────────────────────
  {
    id: 'q28',
    doraArticle: 'Art.29',
    category: 'Concentration Risk',
    text: 'How many financial entities (banks, insurers, investment firms, payment institutions) rely on you for critical or important ICT services? Are you aware of your designation as a potential concentration risk provider under DORA Article 29?',
    hint: 'Provide an approximate count of financial entity clients globally and in the EU. Indicate whether you have been identified by any financial entity or regulator as a concentration risk under DORA. Include any self-assessment of your systemic importance.',
  },
  {
    id: 'q29',
    doraArticle: 'Art.29(3)',
    category: 'Concentration Risk',
    text: 'Do you have a documented policy for managing your own role as a potential ICT concentration risk? How do you ensure service continuity and avoid single points of failure that could affect multiple financial entity clients simultaneously?',
    hint: 'Describe infrastructure redundancy, geographic distribution, capacity management, and any measures taken to avoid correlated failures across your financial entity client base.',
  },

  // ── Change Management ────────────────────────────────────────────────────────
  {
    id: 'q30',
    doraArticle: 'Art.30(3)(b)',
    category: 'Change Management',
    text: 'What is your process for notifying us of material changes to ICT services, infrastructure, subcontractors, or security posture? What advance notice period do you provide, and what constitutes a "material change" under your policy?',
    hint: 'Provide your formal change notification policy: definition of material change, minimum notice period (DORA requires advance notification), communication channel, and escalation path for urgent changes. Include examples of changes that would trigger notification.',
  },

  // ── ICT Staff Training ───────────────────────────────────────────────────────
  {
    id: 'q31',
    doraArticle: 'Art.13(6)',
    category: 'ICT Staff Training',
    text: 'Describe your ICT security awareness and training programme for staff with access to systems supporting our services. How frequently is training conducted, and how do you verify completion and effectiveness?',
    hint: 'Include frequency of mandatory training, topics covered (phishing, social engineering, secure coding, incident response), training delivery method, completion tracking, and metrics used to assess effectiveness. Note any sector-specific DORA or financial services compliance training.',
  },

  // ── Resilience Testing ───────────────────────────────────────────────────────
  {
    id: 'q32',
    doraArticle: 'Art.26',
    category: 'Resilience Testing',
    text: 'Have you participated in, or are you prepared to support, Threat-Led Penetration Testing (TLPT) exercises conducted under the DORA framework (or equivalent TIBER-EU/TIBER-XX frameworks) for the ICT services you deliver to financial entities?',
    hint: 'Indicate whether you have previously participated in TLPT or TIBER exercises as a critical service provider. Describe your TLPT cooperation process: contact person, documentation available to testers, and any constraints on test scope. If not yet required, describe your red team testing programme.',
  },
];

/**
 * Idempotent seed — creates the default template if absent, upgrades it if the
 * version is older than SEED_VERSION.
 */
export async function seedDefaultTemplate() {
  try {
    const existing = await QuestionnaireTemplate.findOne({ isDefault: true });

    if (existing) {
      if (existing.version === SEED_VERSION) {
        logger.info('Default questionnaire template is up to date — skipping seed', {
          service: 'seed',
          version: SEED_VERSION,
          templateId: existing._id,
        });
        return;
      }

      // Upgrade to new version
      existing.questions = DORA_QUESTIONS;
      existing.version = SEED_VERSION;
      await existing.save();
      logger.info(
        `Default questionnaire template upgraded to v${SEED_VERSION} (${DORA_QUESTIONS.length} questions)`,
        {
          service: 'seed',
          templateId: existing._id,
        }
      );
      return;
    }

    await QuestionnaireTemplate.create({
      name: 'DORA Art.28/30 Due Diligence',
      version: SEED_VERSION,
      isDefault: true,
      questions: DORA_QUESTIONS,
    });

    logger.info(
      `Default questionnaire template seeded (${DORA_QUESTIONS.length} questions, v${SEED_VERSION})`,
      {
        service: 'seed',
      }
    );
  } catch (err) {
    logger.error('Failed to seed default questionnaire template', {
      service: 'seed',
      error: err.message,
    });
  }
}
