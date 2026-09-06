import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    'who-its-for',
    'product-principles',
    'getting-started',
    {
      type: 'category',
      label: 'Strategy & Positioning',
      collapsed: false,
      items: [
        'strategy/yc-one-pager',
      ],
    },
    {
      type: 'category',
      label: 'Architecture',
      collapsed: false,
      items: [
        'architecture/overview',
        'architecture/rag-pipeline',
        'architecture/semantic-chunking',
        'architecture/multi-tenancy',
        'architecture/llm-model-selection',
        'architecture/ai-infrastructure',
        'architecture/multimodal-ingestion',
        'architecture/prompt-management',
        'architecture/concentration-graph',
      ],
    },
    {
      type: 'category',
      label: 'Backend',
      collapsed: false,
      items: [
        'backend/overview',
        'backend/services',
        'backend/workers',
        'backend/middleware',
        'backend/models',
        'backend/configuration',
      ],
    },
    {
      type: 'category',
      label: 'Frontend',
      collapsed: true,
      items: [
        'frontend/overview',
        'frontend/components',
        'frontend/pricing',
        'frontend/state-management',
        'frontend/hooks',
      ],
    },
    {
      type: 'category',
      label: 'Security',
      collapsed: true,
      items: [
        'security/overview',
        'security/authentication',
        'security/authorization',
        'security/llm-guardrails',
        'security/data-protection',
      ],
    },
    {
      type: 'category',
      label: 'Deployment',
      collapsed: true,
      items: [
        'deployment/docker',
        'deployment/environment-variables',
        'deployment/production-checklist',
        'deployment/database-capacity',
        'deployment/ci-cd',
        'deployment/email-service',
        'deployment/observability',
      ],
    },
    {
      type: 'category',
      label: 'Certification (RNCP39583)',
      collapsed: false,
      items: [
        'certification/overview',
        'certification/bc02-accessibility-audit',
      ],
    },
    'contributing',
  ],
  apiSidebar: [
    'api/overview',
    {
      type: 'category',
      label: 'Endpoints',
      collapsed: false,
      items: [
        'api/rag',
        'api/conversations',
        'api/auth',
        'api/organizations',
        'api/workspaces',
        'api/assessments',
        'api/compliance',
      ],
    },
    'api/error-handling',
    'api/rate-limiting',
  ],
};

export default sidebars;
