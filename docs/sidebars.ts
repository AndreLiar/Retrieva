import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    'getting-started',
    {
      type: 'category',
      label: 'Architecture',
      collapsed: false,
      items: [
        'architecture/overview',
        'architecture/rag-pipeline',
        'architecture/intent-classification',
        'architecture/semantic-chunking',
        'architecture/multi-tenancy',
        'architecture/data-source-connectors',
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
        'deployment/ci-cd',
        'deployment/email-service',
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
        'api/notion',
        'api/workspaces',
        'api/analytics',
        'api/mcp-sources',
        'api/assessments',
      ],
    },
    'api/error-handling',
    'api/rate-limiting',
  ],
};

export default sidebars;
