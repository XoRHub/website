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
  themes: [
    '@docusaurus/theme-mermaid',
    [
      // Local full-text search — no external service, the index is
      // built at build time and served as static files (GitHub Pages
      // friendly). Opens with Ctrl+K / ⌘K (searchBarShortcutKeymap
      // "mod+k", the plugin default, kept explicit on purpose).
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        indexBlog: false,
        docsRouteBasePath: '/',
        explicitSearchResultPath: true,
        searchBarShortcut: true,
        searchBarShortcutHint: true,
        searchBarShortcutKeymap: 'mod+k',
      },
    ],
  ],

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
      // The logo is the frontend's own brand wordmark (WAAS), copied
      // from waas/frontend/public/logos/ — same theme pairing as its
      // BrandLogo component: black-text variant on light, white-text
      // in dark. No navbar title: the wordmark already says it.
      logo: {
        alt: 'WaaS',
        src: 'img/logos/logo_white.png',
        srcDark: 'img/logos/logo_dark.png',
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
