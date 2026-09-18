# Polaris Flow

Polaris Flow is an all-in-one workflow platform for AI coding environments. It provides installation, OpenSpec workflow schema configuration, skill distribution, and a local dashboard — from project setup through change tracking to visualization.

## Core capabilities

| Capability | Description | Primary locations |
| --- | --- | --- |
| **Install** | Initialize workflow tooling in user projects and supported AI platforms | `src/commands/init.ts`, `src/core/` |
| **Workflow schema** | Ship and configure OpenSpec schemas (backend / frontend / test, etc.) | `assets/`, `src/core/` |
| **Skills** | Bundle and distribute workflow skills (EN/ZH) to target platforms | `assets/skills/`, `assets/skills-zh/`, `assets/manifest.json` |
| **Dashboard** | Local workbench: one process serves both the API and the web UI | `dashboard/` (frontend), `src/dashboard/` (API) |
| **Lifecycle** | Status, doctor, update, uninstall | `src/commands/` |

## Related repositories

| Repository | Relationship |
| --- | --- |
| **polaris-flow** (this repo) | Workflow platform: CLI + schema + skills + Dashboard (frontend and API) |
| **polaris-flow2** | Historical OpenSpec schema and skill content; content may be migrated into this repo over time |

The former `polaris-web` and `polaris-cli` repositories were merged into this repo on 2026-09-18.

## Requirements

- Node.js >= 20
- pnpm 10.18.3

## Development

```bash
pnpm install
pnpm run build
pnpm test
node bin/polaris-flow.js --version
```

## Commands (`polaris`)

User-facing CLI only (runtime hooks use `polaris-flow`):

- `polaris init` — install workflow, schemas, and skills into a project
- `polaris status` — show active changes and workflow status
- `polaris dashboard` — start the local workbench (API + web UI on a single port; `--api-only` for frontend HMR dev)
- `polaris doctor` — diagnose environment, schema, and skill installation
- `polaris update` — update schemas, skills, and dependencies
- `polaris uninstall` — remove installed components (stub)

## License

MIT
