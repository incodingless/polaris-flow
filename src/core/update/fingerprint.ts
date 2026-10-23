/**
 * 资产源指纹 —— update 的门控依据。
 *
 * 取代原 `.polaris/installed-version` + `manifest.version` 的比对：后者把「版本号」当成
 * 「内容是否变化」的代理，一旦 manifest.version 不随资产内容递增，update 就永久跳过。
 *
 * 指纹 = `该类别会写出的源文件内容` + `影响落盘结果的改写输入`（布局、平台映射、config 的模型槽位）。
 * 前者保证资产改了能生效，后者保证改平台布局或 config 后重装能产出不同内容。
 *
 * 指纹按平台计算：同一份源在 nested / flat 布局、不同 agentToolMap 下产出的落盘内容不同。
 */
import { createHash } from 'crypto';
import { readFile } from 'fs/promises';

import { fileExists } from '../../utils/file-system.js';
import type { AssetFile, Assets } from '../assets/manifest.js';
import { getCommandLayout, type Platform } from '../domain/platforms.js';
import type { InstallScope, ProjectPolarisConfig } from '../config/polaris-project-config.js';
import { getHooksJsonSrc } from '../install/hooks.js';
import { shouldSkipSkillShortPath } from '../install/skills.js';
import { type PolarisAssetKind } from '../install/types.js';

/** skills 步骤随技能一并落盘的公共内容（对应 install/skills.ts 的 Step 0） */
const SKILLS_STEP_SHARED_DIRS = ['hooks', 'scorers', 'templates', 'scripts'];

/** skills 步骤随技能一并落盘的语言内容目录 */
const SKILLS_STEP_LANG_DIRS = ['adapters', 'templates', 'policies'];

function collectLangDirFiles(assets: Assets, dirs: string[]): AssetFile[] {
  return assets.langDirAssets
    .filter((asset) => dirs.includes(asset.dir))
    .flatMap((asset) => asset.files);
}

function collectSharedDirFiles(assets: Assets, dirs: string[]): AssetFile[] {
  return assets.sharedAssets
    .filter((asset) => dirs.includes(asset.dir))
    .flatMap((asset) => asset.files);
}

/** skills 类别：技能树 + 注入的 policies + 公共 hooks/scorers/templates/scripts/adapters */
function collectSkillsStepFiles(assets: Assets): AssetFile[] {
  const skillFiles = assets.langDirAssets
    .filter((asset) => asset.dir === 'skills')
    .flatMap((asset) => asset.files.filter((file) => !shouldSkipSkillShortPath(file.shortPath)));

  return [
    ...skillFiles,
    ...collectLangDirFiles(assets, SKILLS_STEP_LANG_DIRS),
    ...collectSharedDirFiles(assets, SKILLS_STEP_SHARED_DIRS),
  ];
}

/** rules 类别：`rules/` 及其子目录（当前资产为空，保留以对齐安装语义） */
function collectRuleFiles(assets: Assets): AssetFile[] {
  return assets.langDirAssets
    .filter((asset) => asset.dir.startsWith('rules/'))
    .flatMap((asset) => asset.files);
}

/**
 * hooks 类别的模板源。
 * manifest 的 `langFiles` 会声明 `hooks.json`，但语言包下可能不存在该文件
 * （当前只有 `assets/shared/hooks.json`），因此两个候选都收集、按 fullPath 去重。
 */
function collectHooksTemplateFiles(assets: Assets): AssetFile[] {
  const candidates: AssetFile[] = [
    ...assets.langFileAssets.filter((asset) => asset.shortPath === 'hooks.json'),
    { shortPath: 'hooks.json', fullPath: getHooksJsonSrc() },
  ];
  const seen = new Set<string>();
  return candidates.filter((file) => {
    if (seen.has(file.fullPath)) return false;
    seen.add(file.fullPath);
    return true;
  });
}

/**
 * 对文件集合与改写输入求 sha256。
 * 缺失的可选声明文件以存在位参与哈希 —— 只比内容无法区分「声明了但不存在」与「未声明」。
 */
async function hashAssetFiles(files: AssetFile[], extra: unknown): Promise<string> {
  const hash = createHash('sha256');
  hash.update(JSON.stringify(extra ?? null));

  const sorted = [...files].sort((a, b) => a.shortPath.localeCompare(b.shortPath));
  for (const file of sorted) {
    hash.update('\u0000');
    hash.update(file.shortPath);
    const exists = await fileExists(file.fullPath);
    hash.update(exists ? '\u0001' : '\u0000');
    if (exists) {
      hash.update(await readFile(file.fullPath));
    }
  }

  return hash.digest('hex').slice(0, 16);
}

/** 单个平台下各类资产的源指纹 */
export type AssetFingerprints = Record<PolarisAssetKind, string>;

/**
 * 计算某平台下各资产类别的源指纹。
 * @param assets 语言资产清单（`readAssets(lang)` 的结果）
 * @param platform 目标平台（布局与工具名映射参与哈希）
 * @param config 项目 config，模型槽位参与 agents 指纹
 * @param scope 安装作用域，影响 hooks command 的落盘写法
 */
export async function computeAssetFingerprints(
  assets: Assets,
  platform: Platform,
  config: ProjectPolarisConfig | null,
  scope: InstallScope,
): Promise<AssetFingerprints> {
  const configWithChallenger = config as (ProjectPolarisConfig & { challenger?: unknown }) | null;

  return {
    skills: await hashAssetFiles(collectSkillsStepFiles(assets), {
      skillsLayout: platform.skillsLayout,
    }),
    commands: await hashAssetFiles(collectLangDirFiles(assets, ['commands']), {
      skillsLayout: platform.skillsLayout,
      commandLayout: getCommandLayout(platform),
    }),
    agents: await hashAssetFiles(collectLangDirFiles(assets, ['agents']), {
      agentToolMap: platform.agentToolMap,
      model: config?.model ?? null,
      challenger: configWithChallenger?.challenger ?? null,
    }),
    rules: await hashAssetFiles(collectRuleFiles(assets), {
      rulesFormat: platform.rulesFormat ?? 'md',
    }),
    hooks: await hashAssetFiles(collectHooksTemplateFiles(assets), {
      hookFormat: platform.hookFormat ?? null,
      platformId: platform.id,
      scope,
    }),
  };
}
