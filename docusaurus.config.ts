import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'WaaS',
  tagline: 'Kubernetes-native Workspace-as-a-Service — full remote desktops from any browser',
  favicon: 'img/favicon.svg',

  // GitHub Pages project site: https://xorhub.github.io/website/
  url: 'https://xorhub.github.io',
  baseUrl: '/website/',
  organizationName: 'XoRHub',
  projectName: 'website',
  trailingSlash: false,

  onBrokenLinks: 'throw',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },
  themes: ['@docusaurus/theme-mermaid'],

  presets: [
    [
      'classic',
      {
        docs: {
          // Docs-only mode: the documentation is the site.
          routeBasePath: '/',
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/XoRHub/website/tree/main/',
          // "current" (docs/) tracks WaaS main and is served under
          // /next/; the newest versioned cut (made when waas tags a
          // release — see CONTRIBUTING.md) is the default the site
          // serves at /.
          versions: {
            current: {
              label: 'Next 🚧',
              banner: 'unreleased',
            },
          },
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/social-card.png',
    navbar: {
      title: 'WaaS',
      logo: {
        alt: 'WaaS logo',
        src: 'img/favicon.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docs',
          position: 'left',
          label: 'Documentation',
        },
        {
          type: 'docsVersionDropdown',
          position: 'right',
        },
        {
          href: 'https://github.com/XoRHub/waas',
          label: 'WaaS',
          position: 'right',
        },
        {
          href: 'https://github.com/XoRHub/waas-images',
          label: 'waas-images',
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
            {label: 'Quickstart', to: '/quickstart'},
            {label: 'Installation', to: '/installation'},
            {label: 'CRD reference', to: '/reference/crds'},
          ],
        },
        {
          title: 'Source',
          items: [
            {label: 'XoRHub/waas', href: 'https://github.com/XoRHub/waas'},
            {label: 'XoRHub/waas-images', href: 'https://github.com/XoRHub/waas-images'},
            {label: 'This site', href: 'https://github.com/XoRHub/website'},
          ],
        },
      ],
      copyright: `Apache-2.0 — community edition, free forever. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'yaml', 'docker', 'json'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
