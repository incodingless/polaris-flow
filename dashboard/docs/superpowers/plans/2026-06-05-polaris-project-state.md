# Project-Level State Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move installation records from global `~/.polaris/lock.yaml` to project-level `<project>/.polaris/polaris.record.yaml`, and add `<project>/.polaris/polaris.meta.yaml` for init configuration.

**Architecture:** Two new files per project — `polaris.meta.yaml` (written once by init, records user choices) and `polaris.record.yaml` (updated per install/remove, records actual installed files). The existing `LockFile` class is refactored to `RecordFile` with a project-relative path. A new `PolarisMetaFile` class manages the meta file. Commands that need project state (`status`, `doctor`, `remove`, `add`) validate that `<project>/.polaris/` exists before proceeding.

**Tech Stack:** TypeScript, Zod (schema validation), yaml (parse/stringify), vitest (testing)

---

### Task 1: Add `contextProjectDir()` helper to context.ts

**Files:**
- Modify: `src/core/context.ts:62-66`

- [ ] **Step 1: Add `contextProjectDir()` function**

After the existing `contextGlobalDir()` function (line 66), add:

```typescript
/** Polaris project-level data dir (`<cwd>/.polaris`). */
export function contextProjectDir(ctx: AppContext): string {
  return join(ctx.cwd, '.polaris')
}
```

- [ ] **Step 2: Run existing tests to verify no regressions**

Run: `npx vitest run tests/unit/context.test.ts`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/core/context.ts
git commit -m "feat: add contextProjectDir() helper for project-level .polaris path"
```

---

### Task 2: Create `polaris.meta.yaml` schema

**Files:**
- Create: `src/schema/meta.schema.ts`

- [ ] **Step 1: Write the Zod schema**

```typescript
import { z } from 'zod'
import { ComponentNameSchema, IdeIdEnum, ScopeEnum } from './component.schema.js'

export const MetaComponentSchema = z.object({
  layer: z.string().min(1),
  name: ComponentNameSchema,
  variant: z.string().optional(),
  skills: z.array(z.string()).optional()
})
export type MetaComponent = z.infer<typeof MetaComponentSchema>

export const PolarisMetaSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  profile: z.object({
    name: z.string().min(1),
    version: z.string().min(1)
  }),
  ides: z.array(z.union([IdeIdEnum, z.string()])).default([]),
  scope: ScopeEnum,
  components: z.array(MetaComponentSchema).default([]),
  polarisVersion: z.string().min(1),
  createdAt: z.string().datetime()
})
export type PolarisMeta = z.infer<typeof PolarisMetaSchema>
```

- [ ] **Step 2: Verify schema compiles**

Run: `npx tsc --noEmit src/schema/meta.schema.ts`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/schema/meta.schema.ts
git commit -m "feat: add PolarisMetaSchema for polaris.meta.yaml"
```

---

### Task 3: Create `PolarisMetaFile` class

**Files:**
- Create: `src/core/config/PolarisMetaFile.ts`

- [ ] **Step 1: Write the class**

```typescript
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

import { PolarisMetaSchema, type PolarisMeta } from '../../schema/meta.schema.js'
import { atomicWrite } from '../../utils/FileOps.js'
import { type AppContext, contextProjectDir } from '../context.js'
import { loadYamlWithSchema } from '../utils/loadYamlWithSchema.js'

export class PolarisMetaFileCorruptError extends Error {
  constructor(public readonly path: string, public override readonly cause: unknown) {
    super(
      `Polaris meta file at ${path} is corrupt or invalid.\n` +
        `Cause: ${cause instanceof Error ? cause.message : String(cause)}\n` +
        `Re-run \`polaris init\` to regenerate.`
    )
    this.name = 'PolarisMetaFileCorruptError'
  }
}

export class PolarisMetaFile {
  readonly path: string

  constructor(private readonly ctx: AppContext) {
    this.path = join(contextProjectDir(ctx), 'polaris.meta.yaml')
  }

  /** Read the meta file. Returns null if the file does not exist (project not initialized). */
  read(): PolarisMeta | null {
    if (!existsSync(this.path)) return null
    let raw: string
    try {
      raw = readFileSync(this.path, 'utf8')
    } catch (err) {
      throw new PolarisMetaFileCorruptError(this.path, err)
    }
    return loadYamlWithSchema(
      raw,
      PolarisMetaSchema,
      (cause) => new PolarisMetaFileCorruptError(this.path, cause)
    )
  }

  /** Write (or overwrite) the meta file atomically. */
  write(meta: PolarisMeta): void {
    const validated = PolarisMetaSchema.parse(meta)
    atomicWrite(this.path, stringifyYaml(validated))
  }

  /** Check whether the project has been initialized. */
  exists(): boolean {
    return existsSync(this.path)
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/core/config/PolarisMetaFile.ts`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/config/PolarisMetaFile.ts
git commit -m "feat: add PolarisMetaFile for polaris.meta.yaml read/write"
```

---

### Task 4: Write tests for `PolarisMetaFile`

**Files:**
- Create: `tests/unit/meta.test.ts`

- [ ] **Step 1: Write the tests**

```typescript
import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { PolarisMetaFile, PolarisMetaFileCorruptError } from '../../src/core/config/PolarisMetaFile.js'
import { buildAppContext } from '../../src/core/context.js'
import { cleanupTempProjects, createTempProject } from '../helpers/tempProject.js'

afterEach(() => cleanupTempProjects())

function newMeta(): { cwd: string; meta: PolarisMetaFile } {
  const cwd = createTempProject()
  mkdirSync(join(cwd, '.polaris'), { recursive: true })
  const ctx = buildAppContext({ homeDir: cwd, cwd })
  return { cwd, meta: new PolarisMetaFile(ctx) }
}

const sampleMeta = {
  schemaVersion: 1 as const,
  profile: { name: 'fullstack', version: '1.2.0' },
  ides: ['trae', 'cursor'],
  scope: 'project' as const,
  components: [
    { layer: 'framework', name: 'openspec', variant: 'default', skills: [] },
    { layer: 'skills', name: 'code-review', variant: 'strict', skills: ['security'] }
  ],
  polarisVersion: '1.0.0',
  createdAt: '2026-06-05T10:30:00.000Z'
}

describe('PolarisMetaFile.read', () => {
  it('returns null when file does not exist', () => {
    const cwd = createTempProject()
    const ctx = buildAppContext({ homeDir: cwd, cwd })
    const meta = new PolarisMetaFile(ctx)
    expect(meta.read()).toBeNull()
  })

  it('returns parsed meta when file exists', () => {
    const { meta } = newMeta()
    meta.write(sampleMeta)
    const read = meta.read()
    expect(read).not.toBeNull()
    expect(read!.profile.name).toBe('fullstack')
    expect(read!.ides).toEqual(['trae', 'cursor'])
  })

  it('throws PolarisMetaFileCorruptError on malformed YAML', () => {
    const { cwd, meta } = newMeta()
    writeFileSync(meta.path, 'profile: [oops\n')
    expect(() => meta.read()).toThrow(PolarisMetaFileCorruptError)
  })
})

describe('PolarisMetaFile.write', () => {
  it('writes valid YAML to disk', () => {
    const { meta } = newMeta()
    meta.write(sampleMeta)
    const onDisk = readFileSync(meta.path, 'utf8')
    expect(onDisk).toContain('fullstack')
    expect(onDisk).toContain('schemaVersion: 1')
  })

  it('overwrites existing file', () => {
    const { meta } = newMeta()
    meta.write(sampleMeta)
    meta.write({ ...sampleMeta, profile: { name: 'minimal', version: '1.0.0' } })
    const read = meta.read()
    expect(read!.profile.name).toBe('minimal')
  })
})

describe('PolarisMetaFile.exists', () => {
  it('returns false when no file', () => {
    const cwd = createTempProject()
    const ctx = buildAppContext({ homeDir: cwd, cwd })
    const meta = new PolarisMetaFile(ctx)
    expect(meta.exists()).toBe(false)
  })

  it('returns true after write', () => {
    const { meta } = newMeta()
    meta.write(sampleMeta)
    expect(meta.exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run tests/unit/meta.test.ts`
Expected: All 7 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/meta.test.ts
git commit -m "test: add PolarisMetaFile unit tests"
```

---

### Task 5: Refactor `LockFile` → `RecordFile` with project-level path

**Files:**
- Create: `src/core/config/RecordFile.ts`
- Modify: `tests/unit/lockfile.test.ts` → migrate to `tests/unit/recordfile.test.ts`

- [ ] **Step 1: Create `RecordFile.ts` (copy of LockFile.ts with project path)**

Copy `src/core/config/LockFile.ts` to `src/core/config/RecordFile.ts` and change:

1. Rename class `LockFile` → `RecordFile`
2. Rename error classes: `LockFileCorruptError` → `RecordFileCorruptError`, `LockFileVersionError` → `RecordFileVersionError`
3. Change the path in constructor from `join(contextGlobalDir(ctx), 'lock.yaml')` to `join(contextProjectDir(ctx), 'polaris.record.yaml')`
4. Update import to add `contextProjectDir`

Key constructor change:

```typescript
import { type AppContext, contextProjectDir } from '../context.js'

// In constructor:
this.path = join(contextProjectDir(ctx), 'polaris.record.yaml')
```

- [ ] **Step 2: Verify RecordFile compiles**

Run: `npx tsc --noEmit src/core/config/RecordFile.ts`
Expected: No type errors.

- [ ] **Step 3: Copy and update tests**

Copy `tests/unit/lockfile.test.ts` to `tests/unit/recordfile.test.ts`. Change:

1. Import `RecordFile, RecordFileCorruptError, RecordFileVersionError` instead of LockFile equivalents
2. In `newLock()` → `newRecord()`, create the `.polaris/` directory in cwd:

```typescript
function newRecord(): { cwd: string; record: RecordFile } {
  const cwd = createTempProject()
  mkdirSync(join(cwd, '.polaris'), { recursive: true })
  const ctx = buildAppContext({ homeDir: cwd, cwd })
  return { cwd, record: new RecordFile(ctx) }
}
```

3. Replace all `lock` variable names with `record`
4. Replace all `LockFile` references with `RecordFile`
5. Replace all `LockFileCorruptError` with `RecordFileCorruptError`
6. Replace all `LockFileVersionError` with `RecordFileVersionError`

Also add `import { mkdirSync } from 'node:fs'` and `import { join } from 'node:path'`.

- [ ] **Step 4: Run record file tests**

Run: `npx vitest run tests/unit/recordfile.test.ts`
Expected: All tests pass (same test logic, just project-level path).

- [ ] **Step 5: Commit**

```bash
git add src/core/config/RecordFile.ts tests/unit/recordfile.test.ts
git commit -m "feat: add RecordFile class with project-level path"
```

---

### Task 6: Update `InstallerEngine` to use `RecordFile`

**Files:**
- Modify: `src/core/installer/InstallerEngine.ts:21,51,97-98,273-278,312,657-666`

- [ ] **Step 1: Change import and type references**

Change the import:
```typescript
// Before:
import type { LockFile } from '../config/LockFile.js'
// After:
import type { RecordFile } from '../config/RecordFile.js'
```

Change the `InstallerEngineDeps` interface:
```typescript
// Before:
lockFile: LockFile
// After:
recordFile: RecordFile
```

- [ ] **Step 2: Update all `this.deps.lockFile` references**

Replace all occurrences of `this.deps.lockFile` with `this.deps.recordFile` in the class:
- Line 273: `await this.deps.lockFile.recordCliInstall(...)` → `await this.deps.recordFile.recordCliInstall(...)`
- Line 312: `await this.deps.lockFile.recordRemove(...)` → `await this.deps.recordFile.recordRemove(...)`
- Line 406: `this.deps.lockFile.getInstalled(...)` → `this.deps.recordFile.getInstalled(...)` (in `buildAddPlan`)
- Line 657: `await this.deps.lockFile.recordInstall(...)` → `await this.deps.recordFile.recordInstall(...)` (in `executeAddPlan`)

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit src/core/installer/InstallerEngine.ts`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/core/installer/InstallerEngine.ts
git commit -m "refactor: rename LockFile to RecordFile in InstallerEngine"
```

---

### Task 7: Update `AddCommandRunner` to use `RecordFile`

**Files:**
- Modify: `src/core/installer/AddCommandRunner.ts:4,47,62-63`

- [ ] **Step 1: Update import and usage**

```typescript
// Before:
import { LockFile } from '../config/LockFile.js'
// After:
import { RecordFile } from '../config/RecordFile.js'

// In runAdd() — before:
const lockFile = new LockFile(ctx)
// After:
const recordFile = new RecordFile(ctx)

// In engine constructor — before:
lockFile,
// After:
recordFile,
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit src/core/installer/AddCommandRunner.ts`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/installer/AddCommandRunner.ts
git commit -m "refactor: use RecordFile in AddCommandRunner"
```

---

### Task 8: Update `init` command to create project state

**Files:**
- Modify: `src/commands/init.ts:1,179,256-315`

- [ ] **Step 1: Add imports**

At the top of the file, add:
```typescript
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { RecordFile } from '../core/config/RecordFile.js'
import { PolarisMetaFile } from '../core/config/PolarisMetaFile.js'
import { contextProjectDir } from '../core/context.js'
import { readPackageVersion } from '../utils/packageVersion.js'
```

Note: `readPackageVersion` currently lives inline in status.ts. Extract it to a shared utility, or duplicate it. For now, let's extract it.

- [ ] **Step 2: Extract `readPackageVersion` to shared utility**

Create `src/utils/packageVersion.ts`:

```typescript
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

export function readPackageVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const pkgPath = resolve(here, '..', '..', 'package.json')
  try {
    const raw = readFileSync(pkgPath, 'utf8')
    return (JSON.parse(raw) as { version?: string }).version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}
```

Update `src/commands/status.ts` to import from `'../utils/packageVersion.js'` instead of the inline function.

- [ ] **Step 3: Create `.polaris/` directory and write meta file after init**

After `initIdeDirectories(ctx.cwd, effectiveIdes)` (around line 179), add `.polaris/` directory creation:

```typescript
// Ensure project .polaris/ directory exists
const projectDir = contextProjectDir(ctx)
if (!existsSync(projectDir)) {
  mkdirSync(projectDir, { recursive: true })
}
```

At the end of `runInit()`, after all components are successfully installed (after line 255, before the `spinner.stop()`), add writing of the meta file:

```typescript
// Write project meta file after successful init
const metaFile = new PolarisMetaFile(ctx)
const version = readPackageVersion()
metaFile.write({
  schemaVersion: 1,
  profile: {
    name: profile.name,
    version: profile.version
  },
  ides: effectiveIdes,
  scope: effectiveScope,
  components: resolved.orderedRefs.map((entry) => {
    const override = config.componentOverrides.get(`${entry.layer ?? ''}/${entry.name}`)
    return {
      layer: entry.layer ?? '',
      name: entry.name,
      variant: override?.variant ?? entry.variant,
      skills: override?.skills ?? extractSkills(entry.options)
    }
  }),
  polarisVersion: version,
  createdAt: new Date().toISOString()
})
```

Note: We need to check if `resolved.orderedRefs` has a `layer` field. Looking at ProfileResolver... Let me check the resolved structure.

The `resolved` object from `ProfileResolver.resolve()` returns:
- `profile: Profile`
- `orderedRefs: ProfileComponentRef[]` (each has `name`, `variant`, `optional`, `options`)
- `layers: Record<LayerKey, ProfileComponentRef[]>`

The `layer` is in the `layers` map keys, not on individual entries. We need to compute it:

```typescript
components: LAYER_KEYS.flatMap((layer) => {
  const entries = resolved.layers[layer] ?? []
  return entries.map((entry) => {
    const overrideKey = `${layer}/${entry.name}`
    const override = config.componentOverrides.get(overrideKey)
    return {
      layer,
      name: entry.name,
      variant: override?.variant ?? entry.variant,
      skills: override?.skills ?? extractSkills(entry.options)
    }
  })
}),
```

- [ ] **Step 4: Add `existsSync` import**

Change the import from `node:fs`:
```typescript
// Before:
// (no fs imports currently in init.ts)
// After — add to existing imports or add new:
import { existsSync, mkdirSync } from 'node:fs'
```

- [ ] **Step 5: Verify compilation**

Run: `npx tsc --noEmit src/commands/init.ts`
Expected: No type errors. Fix any issues with `resolved.layers` references.

- [ ] **Step 6: Run existing init-related tests**

Run: `npx vitest run tests/unit/init-ide.test.ts tests/unit/init-layer.test.ts tests/unit/init-wizard-config.test.ts`
Expected: All existing tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/commands/init.ts src/commands/status.ts src/utils/packageVersion.ts
git commit -m "feat: init writes polaris.meta.yaml to project .polaris/ directory"
```

---

### Task 9: Update `status` command to read project-level state

**Files:**
- Modify: `src/commands/status.ts:1-17,64-115`

- [ ] **Step 1: Add imports and update data sources**

Add imports:
```typescript
import { RecordFile } from '../core/config/RecordFile.js'
import { PolarisMetaFile } from '../core/config/PolarisMetaFile.js'
import { contextProjectDir } from '../core/context.js'
import { readPackageVersion } from '../utils/packageVersion.js'
```

Remove the inline `readPackageVersion` function (moved to shared utility).

- [ ] **Step 2: Add project validation and project-level reads**

At the start of `runStatus()`, after reading the version:

```typescript
// Check project initialization
const metaFile = new PolarisMetaFile(ctx)
if (!metaFile.exists()) {
  if (logger.isJsonMode()) {
    logger.printJson({
      kind: 'error',
      exitCode: 1,
      message: '项目未初始化，请先执行 polaris init'
    })
  } else {
    logger.error('项目未初始化，请先执行 polaris init')
  }
  process.exit(1)
}

const meta = metaFile.read()!
const recordFile = new RecordFile(ctx)
const recordData = recordFile.read()
const dataDir = globalDir()
```

- [ ] **Step 3: Replace lock-based data with project-level data**

Replace:
```typescript
// Before:
const lockFile = new LockFile(ctx)
const lockData = lockFile.read()
// After (already handled in Step 2):
// recordFile and recordData are now project-level
```

Update the installed count source:
```typescript
// Before:
const installedCount = lockData.installedComponents.length
// After:
const installedCount = recordData.installedComponents.length
```

Update the CLI tools source:
```typescript
// Before:
const cliTools = lockData.installedCli.map(...)
// After:
const cliTools = recordData.installedCli.map(...)
```

- [ ] **Step 4: Add project-level info to output**

In both JSON and text output modes, add the meta info. For JSON:

```typescript
logger.printJson({
  version,
  dataDir,
  project: {
    dir: contextProjectDir(ctx),
    profile: meta.profile.name,
    ides: meta.ides,
    scope: meta.scope,
    initializedAt: meta.createdAt
  },
  registry: { ... },
  components: { ... },
  // ...
})
```

For text output, add lines after `Polaris v${version}`:

```typescript
logger.info(`Polaris v${version}`)
logger.info(`  Project:     ${meta.profile.name} (${meta.ides.join(', ')}, ${meta.scope})`)
logger.info(`  Init'd at:   ${meta.createdAt}`)
logger.info(`  Data dir:    ${dataDir}`)
```

- [ ] **Step 5: Verify compilation**

Run: `npx tsc --noEmit src/commands/status.ts`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add src/commands/status.ts
git commit -m "feat: status reads project-level polaris.meta.yaml and polaris.record.yaml"
```

---

### Task 10: Update `remove` command to use `RecordFile` and validate project

**Files:**
- Modify: `src/commands/remove.ts:6,78-83,183`

- [ ] **Step 1: Update imports**

```typescript
// Before:
import { LockFile } from '../core/config/LockFile.js'
// After:
import { RecordFile } from '../core/config/RecordFile.js'
import { PolarisMetaFile } from '../core/config/PolarisMetaFile.js'
```

- [ ] **Step 2: Add project initialization check**

At the start of `runRemove()`, before creating RecordFile:

```typescript
const metaFile = new PolarisMetaFile(ctx)
if (!metaFile.exists()) {
  if (logger.isJsonMode()) {
    logger.printJson({
      kind: 'error',
      exitCode: 1,
      message: '项目未初始化，请先执行 polaris init'
    })
  } else {
    logger.error('项目未初始化，请先执行 polaris init')
  }
  process.exit(1)
}
```

- [ ] **Step 3: Replace LockFile with RecordFile**

```typescript
// Before:
const lockFile = new LockFile(ctx)
const installed = lockFile.getInstalled(componentName)
// After:
const recordFile = new RecordFile(ctx)
const installed = recordFile.getInstalled(componentName)
```

Replace all other `lockFile` references with `recordFile`.

- [ ] **Step 4: Verify compilation**

Run: `npx tsc --noEmit src/commands/remove.ts`
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add src/commands/remove.ts
git commit -m "feat: remove uses RecordFile with project validation"
```

---

### Task 11: Update `add` command to use `RecordFile`

**Files:**
- Modify: `src/commands/add.ts` (only if it references LockFile directly — it delegates to `runAdd` which we already updated in Task 7)

No direct changes needed since `add.ts` delegates to `AddCommandRunner.runAdd()`. Skip this task.

---

### Task 12: Update `install` command to use `RecordFile`

**Files:**
- Modify: `src/commands/install.ts:4,101,239,247-248`

- [ ] **Step 1: Update import**

```typescript
// Before:
import { LockFile } from '../core/config/LockFile.js'
// After:
import { RecordFile } from '../core/config/RecordFile.js'
```

- [ ] **Step 2: Replace LockFile usage**

```typescript
// Before:
const lockFile = new LockFile(ctx)
// After:
const recordFile = new RecordFile(ctx)
```

Replace all `lockFile` references with `recordFile` in the file.

- [ ] **Step 3: Update `resolveComponentNames` signature**

```typescript
// Before:
async function resolveComponentNames(
  ctx: AppContext,
  lockFile: LockFile,
  ...
// After:
async function resolveComponentNames(
  ctx: AppContext,
  recordFile: RecordFile,
  ...
```

Replace `lockFile.listAll()` with `recordFile.listAll()`.

- [ ] **Step 4: Update engine deps**

```typescript
// Before:
const engine = new InstallerEngine({
  lockFile,
  ...
// After:
const engine = new InstallerEngine({
  recordFile,
  ...
```

- [ ] **Step 5: Verify compilation**

Run: `npx tsc --noEmit src/commands/install.ts`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add src/commands/install.ts
git commit -m "refactor: use RecordFile in install command"
```

---

### Task 13: Update `DoctorEngine` and `CheckRunner` for project-level baseline

**Files:**
- Modify: `src/commands/doctor.ts:3,61,69-73`
- Modify: `src/core/doctor/DoctorEngine.ts:2,19,41`
- Modify: `src/core/doctor/CheckRunner.ts:19-23,37-43`

- [ ] **Step 1: Update `doctor.ts` imports and deps**

```typescript
// Before:
import { LockFile } from '../core/config/LockFile.js'
// After:
import { RecordFile } from '../core/config/RecordFile.js'
import { PolarisMetaFile } from '../core/config/PolarisMetaFile.js'
import { contextProjectDir } from '../core/context.js'
```

In `runDoctor()`, add project validation:

```typescript
const metaFile = new PolarisMetaFile(ctx)
if (!metaFile.exists()) {
  if (logger.isJsonMode()) {
    logger.printJson({
      kind: 'error',
      exitCode: 1,
      message: '项目未初始化，请先执行 polaris init'
    })
  } else {
    logger.error('项目未初始化，请先执行 polaris init')
  }
  process.exit(1)
}
```

Replace LockFile with RecordFile:
```typescript
// Before:
const lockFile = new LockFile(ctx)
// After:
const recordFile = new RecordFile(ctx)
const projectDir = contextProjectDir(ctx)
```

Update CheckRunner construction:
```typescript
const checkRunner = new CheckRunner({
  projectRoot: ctx.cwd,
  homeDir: ctx.homeDir,
  globalDir: contextGlobalDir(ctx),
  projectDir
})
```

Update DoctorEngine construction:
```typescript
// Before:
const engine = new DoctorEngine({
  lockFile,
  registry: componentRegistry,
  checkRunner
})
// After:
const engine = new DoctorEngine({
  recordFile,
  registry: componentRegistry,
  checkRunner
})
```

- [ ] **Step 2: Update `DoctorEngine.ts` type references**

```typescript
// Before:
import type { LockFile as LockFileData } from '../../schema/lock.schema.js'
import type { LockFile } from '../config/LockFile.js'
// After:
import type { LockFile as RecordFileData } from '../../schema/lock.schema.js'
import type { RecordFile } from '../config/RecordFile.js'
```

Update `DoctorEngineDeps`:
```typescript
export interface DoctorEngineDeps {
  recordFile: RecordFile
  registry: ComponentRegistry
  checkRunner: CheckRunner
}
```

Update `runAll()`:
```typescript
// Before:
const lockData = this.deps.lockFile.read()
// After:
const recordData = this.deps.recordFile.read()
```

Replace all `lockData` references with `recordData`.

Update `buildManifestChecks`:
```typescript
private async buildManifestChecks(recordData: RecordFileData): Promise<CheckDef[]> {
  // Same logic, renamed parameter
  for (const comp of recordData.installedComponents) {
    // ...
  }
}
```

- [ ] **Step 3: Update `CheckRunner.ts` to accept `projectDir`**

```typescript
export interface CheckRunnerDeps {
  projectRoot: string
  homeDir: string
  globalDir: string
  projectDir: string  // ADD: <project>/.polaris/
}
```

Update the `registerDoctorBuiltins` call:
```typescript
registerDoctorBuiltins(this.evaluator, {
  projectRoot: deps.projectRoot,
  homeDir: deps.homeDir,
  globalDir: deps.globalDir,
  projectDir: deps.projectDir
})
```

- [ ] **Step 4: Verify compilation**

Run: `npx tsc --noEmit src/commands/doctor.ts src/core/doctor/DoctorEngine.ts src/core/doctor/CheckRunner.ts`
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add src/commands/doctor.ts src/core/doctor/DoctorEngine.ts src/core/doctor/CheckRunner.ts
git commit -m "feat: doctor reads project-level RecordFile, validates project init"
```

---

### Task 14: Run full test suite

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass. Investigate and fix any failures.

- [ ] **Step 2: Run TypeScript check on full project**

Run: `npx tsc --noEmit`
Expected: No type errors. Fix any issues.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve test and type errors from project-state refactor"
```

---

### Task 15: Clean up old `LockFile`

**Files:**
- Modify: Delete or deprecate `src/core/config/LockFile.ts`
- Modify: Delete `tests/unit/lockfile.test.ts`

- [ ] **Step 1: Check for remaining LockFile references**

Run: `grep -r "LockFile" src/ --include="*.ts" | grep -v "RecordFile" | grep -v "node_modules" | grep -v ".test."`
Expected: No remaining references (or only in schema types where "LockFile" is a type alias for the data shape). If the schema type is still called `LockFile`, consider adding a type alias in RecordFile.

- [ ] **Step 2: Remove old files if clean**

```bash
git rm src/core/config/LockFile.ts
git rm tests/unit/lockfile.test.ts
```

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor: remove deprecated LockFile in favor of RecordFile"
```



### Post-Implementation Verification

After all tasks complete:

1. **Manual smoke test**: In a temp directory, run `polaris init` and verify `<cwd>/.polaris/polaris.meta.yaml` and `<cwd>/.polaris/polaris.record.yaml` are created with correct content.
2. **Run `polaris status`** — verify it shows project-level info.
3. **Run `polaris doctor`** — verify it uses project baseline.
4. **Run `polaris remove <component>`** — verify it reads/writes project record.
5. **Run `polaris status` outside a project** — verify error message.
