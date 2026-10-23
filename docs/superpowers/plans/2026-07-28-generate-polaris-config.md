# generatePolarisConfig 从模板生成配置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `generatePolarisConfig` 中用 `config.example.yaml` + YAML Document API 生成带注释的 `.polaris/config.yaml`，支持 overwrite。

**Architecture:** 读模板 → `parseDocument({ keepSourceTokens: true })` → 覆盖 6 个运行时字段 → `String(doc)` 写盘。`initPolarisConfig` 透传 `overwrite`；测试通过导出的 `generatePolarisConfig` 直接覆盖。

**Tech Stack:** TypeScript、`yaml@2` Document API、vitest、Node `fs/promises`

## Global Constraints

- 动态字段仅限：`language`、`platform`、`scope`、`install-time`、`main-repo-root`、`worktree-dir`
- 落盘键名保持模板 kebab-case；`platform` 值为 `Platform.id`
- 写盘不用 `writeYamlFile`（会丢注释）
- 不实现 `generateWorkflowConfig` 业务逻辑；为避免阻断 init，改为空操作 no-op
- 不改 `createDefaultProjectPolarisConfig` / `formatPolarisConfigYaml`
- 代码注释用中文；提交仅在用户明确要求时执行（本计划 commit 步骤默认跳过）

## File Structure

| 文件 | 职责 |
|------|------|
| `src/core/install.ts` | `generatePolarisConfig` 实现；导出供测试；`initPolarisConfig` 增加 `overwrite`；`generateWorkflowConfig` 改为 no-op |
| `src/commands/init.ts` | 调用 `initPolarisConfig` 时传入 `Boolean(options.overwrite)` |
| `test/ts/generate-polaris-config.test.ts` | 生成 / 跳过 / overwrite / 注释保留 |

---

### Task 1: 失败测试 — 首次生成与字段覆盖

**Files:**
- Create: `test/ts/generate-polaris-config.test.ts`
- Modify (稍后 Task 2): `src/core/install.ts`（导出 `generatePolarisConfig`）

**Interfaces:**
- Consumes: 无（先写测，假定签名如下）
- Produces（目标签名）:

```ts
export async function generatePolarisConfig(
  projectPath: string,
  language: Language,
  scope: InstallScope,
  platforms: Platform[],
  overwrite?: boolean,
): Promise<void>;
```

- [ ] **Step 1: 写失败测试**

创建 `test/ts/generate-polaris-config.test.ts`：

```ts
/**
 * generatePolarisConfig：从 config.example.yaml 生成项目配置的单元测试。
 */
import path from 'path';
import os from 'os';
import { mkdtemp, readFile, writeFile, mkdir } from 'fs/promises';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { generatePolarisConfig } from '../../src/core/install.js';
import { getPolarisConfigPath, resolveWorktreeRoot } from '../../src/core/assets/polaris-paths.js';
import { PLATFORMS } from '../../src/core/platforms.js';

function platformById(id: string) {
  const p = PLATFORMS.find((x) => x.id === id);
  if (!p) throw new Error(`unknown platform: ${id}`);
  return p;
}

describe('generatePolarisConfig', () => {
  it('目标不存在时从模板生成，覆盖 6 个动态字段并保留其它默认值与注释', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-gen-config-'));
    const platforms = [platformById('trae'), platformById('claude')];

    await generatePolarisConfig(tmpDir, 'en', 'project', platforms, false);

    const configPath = getPolarisConfigPath(tmpDir);
    const raw = await readFile(configPath, 'utf-8');
    const parsed = parseYaml(raw) as Record<string, unknown>;

    expect(parsed.language).toBe('en');
    expect(parsed.platform).toEqual(['trae', 'claude']);
    expect(parsed.scope).toBe('project');
    expect(typeof parsed['install-time']).toBe('string');
    expect(String(parsed['install-time'])).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(parsed['main-repo-root']).toBe(path.resolve(tmpDir));
    expect(parsed['worktree-dir']).toBe(resolveWorktreeRoot(tmpDir, 'project'));
    expect(parsed.kind).toBe('solo');
    expect(parsed.model).toBeTruthy();
    expect(raw).toContain('# 基础配置');
  });

  it('已存在且 overwrite=false 时不改文件', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-gen-config-'));
    const configPath = getPolarisConfigPath(tmpDir);
    await mkdir(path.dirname(configPath), { recursive: true });
    const sentinel = '# sentinel\nlanguage: "zh"\nplatform:\n  - "trae"\n';
    await writeFile(configPath, sentinel, 'utf-8');

    await generatePolarisConfig(tmpDir, 'en', 'project', [platformById('claude')], false);

    expect(await readFile(configPath, 'utf-8')).toBe(sentinel);
  });

  it('已存在且 overwrite=true 时按模板重写动态字段', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'polaris-gen-config-'));
    const configPath = getPolarisConfigPath(tmpDir);
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, 'language: "zh"\nkind: "old"\n', 'utf-8');

    await generatePolarisConfig(tmpDir, 'en', 'global', [platformById('cursor')], true);

    const raw = await readFile(configPath, 'utf-8');
    const parsed = parseYaml(raw) as Record<string, unknown>;
    expect(parsed.language).toBe('en');
    expect(parsed.platform).toEqual(['cursor']);
    expect(parsed.scope).toBe('global');
    expect(parsed['main-repo-root']).toBe(path.resolve(tmpDir));
    expect(parsed['worktree-dir']).toBe(resolveWorktreeRoot(tmpDir, 'global'));
    expect(parsed.kind).toBe('solo');
    expect(raw).toContain('# 基础配置');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/ts/generate-polaris-config.test.ts`

Expected: FAIL（`generatePolarisConfig` 未导出，或行为不符合断言）

---

### Task 2: 实现 generatePolarisConfig

**Files:**
- Modify: `src/core/install.ts`
- Test: `test/ts/generate-polaris-config.test.ts`

**Interfaces:**
- Consumes: `getConfigExampleYamlSrc`、`getPolarisConfigPath`、`resolveWorktreeRoot`、`fileExists`、`parseDocument`（`yaml`）
- Produces: 导出的 `generatePolarisConfig`（签名见 Task 1）

- [ ] **Step 1: 实现并导出函数**

在 `src/core/install.ts` 中：

1. 增加 import：

```ts
import path from 'path';
import { readFile, writeFile } from 'fs/promises';
import { parseDocument } from 'yaml';
import { getConfigExampleYamlSrc, getHarnessGitignoreSrc, getPolarisConfigPath, getPolarisGitignorePath, resolveWorktreeRoot } from './assets/polaris-paths.js';
import { ensureDir } from '../utils/file-system.js';
```

（删掉本函数路径不再需要的 `copyIfMissing`/`writeYamlFile` 引用，若其它处仍用则保留。）

2. 用下列实现替换现有 `generatePolarisConfig`，并 `export`：

```ts
/**
 * 基于 config.example.yaml 生成 `.polaris/config.yaml`。
 * 保留模板注释；仅覆盖 language / platform / scope / install-time / main-repo-root / worktree-dir。
 * @param overwrite 为 true 时即使文件已存在也整文件按模板重写
 */
export async function generatePolarisConfig(
  projectPath: string,
  language: Language,
  scope: InstallScope,
  platforms: Platform[],
  overwrite: boolean = false,
): Promise<void> {
  const polarisConfigPath = getPolarisConfigPath(projectPath);
  if (!overwrite && (await fileExists(polarisConfigPath))) {
    return;
  }

  const templateText = await readFile(getConfigExampleYamlSrc(), 'utf-8');
  const doc = parseDocument(templateText, { keepSourceTokens: true });

  doc.set('language', language);
  doc.set(
    'platform',
    platforms.map((p) => p.id),
  );
  doc.set('scope', scope);
  doc.set('install-time', new Date().toISOString());
  doc.set('main-repo-root', path.resolve(projectPath));
  doc.set('worktree-dir', resolveWorktreeRoot(projectPath, scope));

  await ensureDir(path.dirname(polarisConfigPath));
  const text = String(doc);
  await writeFile(polarisConfigPath, text.endsWith('\n') ? text : `${text}\n`, 'utf-8');
}
```

3. 同步修正 `initPolarisConfig` 签名与调用（去掉无用的 `ProjectLayoutOption`，增加 `overwrite`）：

```ts
/**
 * 初始化项目 Polaris 配置、工作流占位与 .gitignore。
 */
export async function initPolarisConfig(
  projectPath: string,
  language: Language,
  scope: InstallScope,
  platforms: Platform[],
  overwrite: boolean = false,
): Promise<void> {
  await generatePolarisConfig(projectPath, language, scope, platforms, overwrite);
  await generateWorkflowConfig(projectPath);
  await copyIfMissing(getHarnessGitignoreSrc(), getPolarisGitignorePath(projectPath));
}
```

4. `generateWorkflowConfig` 改为 no-op（不抛错，避免阻断 init）：

```ts
/**
 * 生成 Polaris 工作流配置文件（占位，尚未实现）。
 */
async function generateWorkflowConfig(_projectPath: string): Promise<void> {
  // 工作流模板生成另开任务；此处空操作以免阻断 init
}
```

- [ ] **Step 2: 跑测试确认通过**

Run: `npx vitest run test/ts/generate-polaris-config.test.ts`

Expected: PASS（3 tests）

---

### Task 3: 接线 init 的 overwrite

**Files:**
- Modify: `src/commands/init.ts`（约 229 行附近）

**Interfaces:**
- Consumes: `initPolarisConfig(projectPath, language, scope, platforms, overwrite)`
- Produces: init 在 `options.overwrite === true` 时会重写 config

- [ ] **Step 1: 改调用**

将：

```ts
await initPolarisConfig(projectPath, language, scope, platforms, options);
```

改为：

```ts
await initPolarisConfig(projectPath, language, scope, platforms, Boolean(options.overwrite));
```

- [ ] **Step 2: 类型检查**

Run: `pnpm exec tsc --noEmit -p tsconfig.json`（或项目惯用 `pnpm build`）

Expected: 与本改动相关的 `initPolarisConfig` / `generatePolarisConfig` 签名错误消失。若仓库另有无关 WIP 错误，只修本任务引入的问题。

- [ ] **Step 3: 相关测试再跑一遍**

Run: `npx vitest run test/ts/generate-polaris-config.test.ts`

Expected: PASS

---

### Task 4: Changelog（若行为已可交付）

**Files:**
- Modify: `CHANGELOG.md`
- 对照 `package.json` version 与 master 版本，按 AGENTS.md 规则追加条目

- [ ] **Step 1: 查 master 版本**

Run: `git show master:package.json | head -5`（若无 master 则用 `main`）

- [ ] **Step 2: 追加 Changelog**

在当前应递增的版本条目下增加：

```markdown
### Changed

- **init config 生成**: 从 `config.example.yaml` 生成带注释的 `.polaris/config.yaml`，覆盖语言/平台/作用域/路径等运行时字段；`--overwrite` 时整文件重写
```

（若当前分支已有高于 master 的版本条目则追加到该版本下，不新开版本号。）

---

## Spec Coverage Checklist

| Spec 要求 | Task |
|-----------|------|
| 读模板 + Document API + 保注释 | Task 2 |
| 6 个动态字段 | Task 1–2 |
| 存在跳过 / overwrite 重写 | Task 1–2 |
| init 传入 overwrite | Task 3 |
| 不用 writeYamlFile | Task 2 |
| 不实现 workflow 业务 | Task 2 no-op |
| 测试 4 场景（生成/跳过/overwrite/注释） | Task 1（注释断言含在生成与 overwrite case） |
| Changelog | Task 4 |

## Self-Review Notes

- 无 TBD / 占位实现步骤
- `generatePolarisConfig` 签名在 Task 1/2 一致
- `platform` 使用 `p.id`，与模板 `trae` 一致
