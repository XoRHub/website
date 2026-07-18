import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    'intro',
    'quickstart',
    {
      type: 'category',
      label: 'Installation',
      link: {type: 'doc', id: 'installation/index'},
      items: ['installation/configuration', 'installation/try-locally'],
    },
    {
      type: 'category',
      label: 'Concepts',
      link: {type: 'doc', id: 'concepts/index'},
      items: [
        'concepts/workspace-lifecycle',
        'concepts/templates-and-protocols',
        'concepts/governance',
        'concepts/placement',
        'concepts/volumes',
        'concepts/workspace-deletion',
      ],
    },
    {
      type: 'category',
      label: 'Using the CRDs',
      items: ['guides/using-the-crds', 'guides/examples', 'guides/remote-workspaces'],
    },
    {
      type: 'category',
      label: 'Administration',
      items: ['admin/bootstrap-governance', 'admin/daily-operations'],
    },
    {
      type: 'category',
      label: 'CRD reference',
      link: {type: 'doc', id: 'reference/crds/index'},
      items: [
        'reference/crds/workspace',
        'reference/crds/workspacetemplate',
        'reference/crds/workspacepolicy',
        'reference/crds/workspaceimage',
      ],
    },
    {
      type: 'category',
      label: 'Workspace images',
      link: {type: 'doc', id: 'images/index'},
      items: ['images/build-your-own'],
    },
    'troubleshooting',
    'accepted-limitations',
  ],
};

export default sidebars;
