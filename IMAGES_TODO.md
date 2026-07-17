# Images to produce

Every screenshot/diagram below currently renders as a gray placeholder
(`static/img/placeholders/<name>.png`). To replace one: drop the real
image over the placeholder file (or a new file under `static/img/` and
update the reference), delete the `TODO(image)` comment next to the
reference, and remove the row here.

This file is not published (it lives outside `docs/`).

| Placeholder file | Used in | What to capture |
|---|---|---|
| `img/placeholders/dashboard.png` | `docs/intro.md`, `docs/admin/daily-operations.md` | Portail utilisateur listant les workspaces (cards avec phase/protocole) |
| `img/placeholders/architecture.png` | `docs/intro.md` | Schéma d'architecture propre (Browser → API Server → K8s API → Operator → pod/VM ; wwt → guacd) — un mermaid provisoire existe déjà sur la page |
| `img/placeholders/create-workspace.png` | `docs/quickstart.md` | Dialogue de création de workspace (choix template + sliders sizing) |
| `img/placeholders/session-vnc.png` | `docs/quickstart.md` | Session VNC XFCE ouverte dans le navigateur (overlay WaaS visible) |
| `img/placeholders/template-picker.png` | `docs/concepts/templates-and-protocols.md` | Picker de templates (icônes dashboard-icons, descriptions) |
| `img/placeholders/volumes-tab.png` | `docs/concepts/volumes.md` | Onglet Volumes (volumes retenus, provenance, bouton delete) |
| `img/placeholders/fleet-view.png` | `docs/admin/daily-operations.md` | Dashboard Fleet admin (liste des workspaces, onglets Volumes / Remote workspaces) |
| `img/placeholders/admin-users.png` | `docs/admin/daily-operations.md` | Page Users admin (dialogue d'édition avec la vue effective-policy) |
| `img/placeholders/image-layers.png` | `docs/images/index.md` | Schéma de l'arborescence base → desktop → apps (un mermaid provisoire existe déjà) |
| `img/social-card.png` | `docusaurus.config.ts` (og:image) | Carte sociale 1200×630 avec logo/branding WaaS |

Note : les pages sous `versioned_docs/version-v0.1.0/` référencent les
mêmes fichiers — remplacer le PNG met à jour toutes les versions d'un
coup ; les commentaires `TODO(image)` dupliqués dans le snapshot
peuvent rester (ils ne rendent rien).
