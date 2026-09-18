# Project-Level State Storage Redesign

## Status

Approved, ready for implementation plan.

## Problem

`polaris init` does not create a `.polaris/` directory in the project root. All installation records (IDE choices, component manifests, versions) are stored in `~/.polaris/polaris.record.yaml` — a single global file that aggregates records from all projects. The `status` and `doctor` commands have no project-level baseline to reference, making them unable to report project-specific state.

## Design

### Two-Level State Architecture

**Global `~/.polaris/`** — environment-level only (no `polaris.record.yaml`):

```
~/.polaris/
├── config.yaml          # registry URL, token, default scope
├── cache/               # component manifest cache (24h TTL)
├── backups/             # operation-level backup snapshots
├── profiles/            # user-level custom profiles
├── components/          # user-level custom component manifests
└── init-wizard.yaml     # user-level init wizard customization
```

**Project `<project>/.polaris/`** — created by `polaris init`:

```
<project>/.polaris/
├── polaris.meta.yaml    # initialization configuration (written once by init)
└── polaris.record.yaml    # component installation records (updated by install/remove)
```

### `polaris.meta.yaml` Schema

```yaml
profile:
  name: fullstack
  version: 1.2.0
ides:
  - trae
  - cursor
scope: project
components:
  - layer: framework
    name: openspec
    variant: default
    skills: []
  - layer: skills
    name: code-review
    variant: strict
    skills: [security, performance]
polarisVersion: 1.0.0
createdAt: "2026-06-05T10:30:00.000Z"
```

Zod schema types:

```typescript
interface PolarisMeta {
  schemaVersion: 1
  profile: { name: string; version: string }
  ides: IdeId[]
  scope: Scope
  components: { layer: string; name: string; variant?: string; skills?: string[] }[]
  polarisVersion: string
  createdAt: string // ISO 8601
}
```

### `polaris.record.yaml` Schema

Unchanged from current `RecordFileSchema`:

```typescript
interface RecordFile {
  schemaVersion: 1
  installedComponents: InstalledComponent[]  // name, version, source, variant, scope, ides, files[], timestamp
  installedCli: InstalledCli[]               // componentName, cliName, version, timestamp
}
```

### Relationship Between the Two Files

| Dimension | `polaris.meta.yaml` | `polaris.record.yaml` |
|-----------|-------------------|------------|
| What it records | User **choices**: profile, IDEs, component variants/skills | Actual **results**: installed files with hashes, versions, timestamps |
| Written when | `init` completes (write once) | `init`, `install`, `remove` (updated per operation) |
| Read by | `status` (show project config), future `init --repair` | `status` (installed counts), `doctor` (health baseline), `remove` (cleanup target), `install` (conflict detection via file hash) |
| Analogy | `package.json` (declares dependencies) | `package-lock.json` (locks exact versions + integrity) |

### Command Behavior

| Command | Reads | Writes | No `<project>/.polaris/` |
|---------|-------|--------|--------------------------|
| `install` | `~/.polaris/` env | `~/.polaris/` env | N/A (system-level) |
| `init` | `~/.polaris/` env | Creates `<project>/.polaris/`, writes `polaris.meta.yaml` + `polaris.record.yaml` | N/A (init creates it) |
| `remove` | `<project>/.polaris/polaris.record.yaml` | `<project>/.polaris/polaris.record.yaml`, backups to `<project>/.polaris-backup/` | Error: "项目未初始化，请先执行 polaris init" |
| `status` | `<project>/.polaris/polaris.meta.yaml` + `polaris.record.yaml`, `~/.polaris/` env | None | Error: "项目未初始化，请先执行 polaris init" |
| `doctor` | `<project>/.polaris/polaris.record.yaml`, project filesystem | None | Error: "项目未初始化，请先执行 polaris init" |

### Key Code Changes

1. **`RecordFile`** — constructor accepts `projectRoot`, path becomes `<projectRoot>/.polaris/polaris.record.yaml`
2. **New `PolarisMetaFile`** — class managing `polaris.meta.yaml` read/write at `<projectRoot>/.polaris/polaris.meta.yaml`
3. **`context.ts`** — add `projectDir(context: AppContext): string` helper: `join(ctx.cwd, '.polaris')`
4. **`runInit()`** — after successful component installation, write both `polaris.meta.yaml` and `polaris.record.yaml` to project
5. **`runStatus()`** — add project-level reads: `PolarisMetaFile.read()` + `RecordFile.read()` for project info
6. **`DoctorEngine`/`CheckRunner`** — pass `projectDir` for baseline comparison
7. **`runRemove()`** — validate `<project>/.polaris/` exists before proceeding

### Backward Compatibility

None. Projects initialized before this change must re-run `polaris init`. `status`/`doctor`/`remove` on uninitialized projects will error with a clear message.

### Non-Goals

- `~/.polaris/polaris.record.yaml` migration tooling
- Global aggregation view across projects
- Project state diff/comparison
