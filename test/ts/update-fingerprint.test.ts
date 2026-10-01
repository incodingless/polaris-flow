/**
 * 资产源指纹：稳定性、按类别隔离、布局与 config 输入生效、跳过规则。
 */
import path from 'path';
import os from 'os';
import { mkdir, mkdtemp, writeFile } from 'fs/promises';
import { describe, expect, it } from 'vitest';

import type { AssetFile, Assets } from '../../src/core/assets/manifest.js';
import type { ProjectPolarisConfig } from '../../src/core/config/polaris-project-config.js';
import { PLATFORMS } from '../../src/core/domain/platforms.js';
import { computeAssetFingerprints } from '../../src/core/update/fingerprint.js';

const claude = PLATFORMS.find((p) => p.id === 'claude')!;
const trae = PLATFORMS.find((p) => p.id === 'trae')!;

/** 资产目录 → (相对短路径 → 内容) */
type DirSpec = Record<string, Record<string, string>>;

/**
 * 用临时目录构造合成资产清单，避免改动仓库内真实 assets。
 */
async function buildAssets(spec: {
  langDirs?: DirSpec;
  langFiles?: Record<string, string>;
  sharedDirs?: DirSpec;
}): Promise<Assets> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'polaris-fingerprint-'));

  const write = async (
    scopeDir: string,
    dir: string,
    shortPath: string,
    content: string,
  ): Promise<string> => {
    const fullPath = path.join(root, scopeDir, dir, shortPath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, 'utf-8');
    return fullPath;
  };

  const collect = async (scopeDir: string, dirs: DirSpec) =>
    Promise.all(
      Object.entries(dirs).map(async ([dir, files]) => ({
        dir,
        files: await Promise.all(
          Object.entries(files).map(async ([shortPath, content]) => ({
            shortPath,
            fullPath: await write(scopeDir, dir, shortPath, content),
          })),
        ),
      })),
    );

  return {
    langDirAssets: await collect('zh', spec.langDirs ?? {}),
    langFileAssets: await Promise.all(
      Object.entries(spec.langFiles ?? {}).map(async ([shortPath, content]) => ({
        shortPath,
        fullPath: await write('zh', '.', shortPath, content),
      })),
    ),
    sharedAssets: await collect('shared', spec.sharedDirs ?? {}),
  };
}

/** 一份最小可用资产：每个类别都有内容 */
function baseSpec() {
  return {
    langDirs: {
      skills: { 'coding/build/SKILL.md': 'build v1' },
      commands: { 'coding/normal.md': 'normal v1' },
      agents: { 'review/plan-review-agent.md': 'agent v1' },
      policies: { 'ask-question-react.md': 'policy v1' },
    },
    langFiles: { 'hooks.json': '{"hooks":{}}' },
    sharedDirs: { hooks: { 'session-start.sh': 'echo v1' } },
  };
}

describe('computeAssetFingerprints', () => {
  it('同一输入重复计算结果一致', async () => {
    const spec = baseSpec();
    const first = await computeAssetFingerprints(await buildAssets(spec), claude, null, 'project');
    const second = await computeAssetFingerprints(await buildAssets(spec), claude, null, 'project');
    expect(second).toEqual(first);
  });

  it('源内容变化只影响对应类别的指纹', async () => {
    const baseline = await computeAssetFingerprints(
      await buildAssets(baseSpec()),
      claude,
      null,
      'project',
    );

    const spec = baseSpec();
    spec.langDirs.commands['coding/normal.md'] = 'normal v2';
    const changed = await computeAssetFingerprints(
      await buildAssets(spec),
      claude,
      null,
      'project',
    );

    expect(changed.commands).not.toBe(baseline.commands);
    expect(changed.skills).toBe(baseline.skills);
    expect(changed.agents).toBe(baseline.agents);
  });

  it('技能目录结构变化（新增叶技能）会改变 skills 指纹', async () => {
    const baseline = await computeAssetFingerprints(
      await buildAssets(baseSpec()),
      claude,
      null,
      'project',
    );

    const spec = baseSpec();
    spec.langDirs.skills['coding/tweak/SKILL.md'] = 'tweak v1';
    const changed = await computeAssetFingerprints(
      await buildAssets(spec),
      claude,
      null,
      'project',
    );

    expect(changed.skills).not.toBe(baseline.skills);
  });

  it('skillsLayout 影响 skills 与 commands（同一源在 nested / flat 下产物不同）', async () => {
    const assets = await buildAssets(baseSpec());
    const nested = await computeAssetFingerprints(assets, claude, null, 'project');
    const flat = await computeAssetFingerprints(assets, trae, null, 'project');

    expect(flat.skills).not.toBe(nested.skills);
    expect(flat.commands).not.toBe(nested.commands);
    // agents 另受 agentToolMap 影响：claude 与 trae 的平台工具名映射不同
    expect(flat.agents).not.toBe(nested.agents);
  });

  it('commandLayout 影响 commands 而不影响 skills（Cursor 命令扁平）', async () => {
    const cursor = PLATFORMS.find((p) => p.id === 'cursor')!;
    const assets = await buildAssets(baseSpec());
    // cursor 与 claude 同为 nested skills，仅 commandLayout 不同
    const cursorResult = await computeAssetFingerprints(assets, cursor, null, 'project');
    const claudeResult = await computeAssetFingerprints(assets, claude, null, 'project');

    expect(cursorResult.skills).toBe(claudeResult.skills);
    expect(cursorResult.commands).not.toBe(claudeResult.commands);
  });

  it('config 的模型槽位影响 agents 指纹，不影响 skills', async () => {
    const assets = await buildAssets(baseSpec());
    const withoutModel = await computeAssetFingerprints(assets, claude, null, 'project');
    const withModel = await computeAssetFingerprints(
      assets,
      claude,
      {
        language: 'zh',
        platforms: [],
        scope: 'project',
        model: { default: 'GLM5.2', code: 'Doubao' },
      } as unknown as ProjectPolarisConfig,
      'project',
    );

    expect(withModel.agents).not.toBe(withoutModel.agents);
    expect(withModel.skills).toBe(withoutModel.skills);
    expect(withModel.commands).toBe(withoutModel.commands);
  });

  it('scope 影响 hooks 指纹（项目级与全局的 command 写法不同）', async () => {
    const assets = await buildAssets(baseSpec());
    const project = await computeAssetFingerprints(assets, claude, null, 'project');
    const global = await computeAssetFingerprints(assets, claude, null, 'global');

    expect(global.hooks).not.toBe(project.hooks);
    expect(global.skills).toBe(project.skills);
  });

  it('声明但缺失的可选文件以存在位参与哈希', async () => {
    const assets = await buildAssets(baseSpec());
    const present = assets.langFileAssets[0];
    expect(present.shortPath).toBe('hooks.json');

    const missing: AssetFile = {
      shortPath: 'hooks.json',
      fullPath: path.join(path.dirname(present.fullPath), 'does-not-exist.json'),
    };

    const withMissing = await computeAssetFingerprints(
      { ...assets, langFileAssets: [missing] },
      claude,
      null,
      'project',
    );
    const withPresent = await computeAssetFingerprints(
      { ...assets, langFileAssets: [present] },
      claude,
      null,
      'project',
    );

    expect(withMissing.hooks).not.toBe(withPresent.hooks);
  });

  it('退役与文档文件不参与 skills 指纹（requirements-engineering / README）', async () => {
    const spec = baseSpec();
    const assets = await buildAssets(spec);
    const baseline = await computeAssetFingerprints(assets, claude, null, 'project');

    spec.langDirs.skills['requirements-engineering/old/SKILL.md'] = 'legacy';
    spec.langDirs.skills['README.md'] = 'docs';
    const withSkipped = await computeAssetFingerprints(
      await buildAssets(spec),
      claude,
      null,
      'project',
    );

    expect(withSkipped.skills).toBe(baseline.skills);
  });

  it('空资产不抛错，各类别给出稳定指纹', async () => {
    const result = await computeAssetFingerprints(
      await buildAssets({}),
      claude,
      null,
      'project',
    );
    for (const kind of ['skills', 'commands', 'agents', 'rules', 'hooks'] as const) {
      expect(result[kind]).toMatch(/^[0-9a-f]{16}$/);
    }
  });
});
