import { QuestionnaireTemplate } from '../models/QuestionnaireTemplate.js';
import logger from '../config/logger.js';

export const DORA_QUESTIONS = [
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
    id: 'q19',
    doraArticle: 'Art.30(2)(h)',
    category: 'Exit Planning',
    text: 'Describe the exit assistance and transition support you would provide to enable us to migrate to an alternative provider. What is included and for how long?',
    hint: 'Include transition planning support, data migration assistance, knowledge transfer, and any costs associated with exit support.',
  },
  {
    id: 'q20',
    doraArticle: 'Art.28(8)',
    category: 'Regulatory History',
    text: 'Have you experienced any material ICT incidents or been subject to regulatory actions, sanctions, or significant audit findings in the past 24 months? If so, please summarise.',
    hint: 'This includes ICT-related regulatory investigations, fines, enforcement notices, or material incidents disclosed to regulators.',
  },
];

/**
 * Idempotent seed — skips if the default template already exists.
 */
export async function seedDefaultTemplate() {
  try {
    const exists = await QuestionnaireTemplate.findOne({ isDefault: true });
    if (exists) {
      logger.info('Default questionnaire template already exists — skipping seed', {
        service: 'seed',
        templateId: exists._id,
      });
      return;
    }

    await QuestionnaireTemplate.create({
      name: 'DORA Art.28/30 Due Diligence',
      version: '1.0',
      isDefault: true,
      questions: DORA_QUESTIONS,
    });

    logger.info('Default questionnaire template seeded (20 DORA questions)', {
      service: 'seed',
    });
  } catch (err) {
    logger.error('Failed to seed default questionnaire template', {
      service: 'seed',
      error: err.message,
    });
  }
}
