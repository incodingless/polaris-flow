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
- `polaris update` — update the program, workflow assets, and dependencies (scope selectable)
- `polaris uninstall` — remove installed components (stub)

### `polaris update` scope

Three layers, independently selectable; all by default.

| Layer | Members | Notes |
|---|---|---|
| `program` | — | The CLI itself (npm package). Detects the package manager in use and installs `@latest` globally; degrades to a hint under `npx` |
| `assets` | `skills` `commands` `agents` `rules` `hooks` | Gated by asset source fingerprints; skipped entirely when on-disk content already matches |
| `deps` | `openspec` `superpowers` `codegraph` | Reuses the installers from `init` |

| Option | Description |
|---|---|
| `--only <items>` | Only update the listed targets (comma-separated, groups allowed); mutually exclusive with `--skip` |
| `--skip <items>` | Update everything except the listed targets |
| `--force` | Ignore asset source fingerprints and rewrite the selected targets |
| `--prune` | Remove stale artifacts in Polaris-owned directories (currently `skills` / `commands`) |
| `--lang <lang>` | Skill language: `zh` or `en`; defaults to `.polaris/config.yaml` |
| `--scope <scope>` | Install scope: `project` or `global`; defaults to `.polaris/config.yaml` |
| `--json` | Output structured JSON |

Examples: `polaris update --only skills,commands`, `polaris update --skip deps`, `polaris update --only assets --prune`

## License

MIT
