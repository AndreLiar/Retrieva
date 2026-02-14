import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'RAG Platform Documentation',
  tagline: 'Production-Ready Retrieval-Augmented Generation with Notion Integration',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://andreliar.github.io',
  baseUrl: '/Retrieva/',

  organizationName: 'AndreLiar',
  projectName: 'Retrieva',
  trailingSlash: false,
  deploymentBranch: 'gh-pages',

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/rag-social-card.jpg',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'RAG Platform',
      logo: {
        alt: 'RAG Platform Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          type: 'docSidebar',
          sidebarId: 'apiSidebar',
          position: 'left',
          label: 'API Reference',
        },
        {
          href: 'https://github.com/AndreLiar/Retrieva',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Getting Started',
              to: '/getting-started',
            },
            {
              label: 'Architecture',
              to: '/architecture/overview',
            },
            {
              label: 'API Reference',
              to: '/api/overview',
            },
          ],
        },
        {
          title: 'Guides',
          items: [
            {
              label: 'Backend Development',
              to: '/backend/overview',
            },
            {
              label: 'Frontend Development',
              to: '/frontend/overview',
            },
            {
              label: 'Deployment',
              to: '/deployment/docker',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'Security',
              to: '/security/overview',
            },
            {
              label: 'Contributing',
              to: '/contributing',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} RAG Platform. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'typescript', 'javascript'],
    },
    tableOfContents: {
      minHeadingLevel: 2,
      maxHeadingLevel: 4,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
