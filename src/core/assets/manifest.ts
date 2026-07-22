/**
 * assets/manifest.json 解析与语言资产路径解析。
 * 负责扫描 skills/commands/hooks 等可分发文件，供安装管线消费。
 */
import path from 'path';

import { fileExists, readDir, readJson } from '../../utils/file-system.js';
import type { Language } from '../config/polaris-config.js';
import { getAssetsDir } from '../config/polaris-paths.js';

/** Manifest 中单个 hook 条目 */
export type HookConfig = {
  matcher: string;
  description: string;
};

/** assets/manifest.json 结构 */
export type AssetManifest = {
  version: string;
  languages?: Array<{ id: string; name: string }>;
  langContentDirs?: string[];
  langFiles?: string[];
  sharedDirs?: string[];
  /** 兼容旧版显式列表 */
  skills?: string[];
  rules?: string[];
  hooks?: Record<string, HookConfig>;
};

/** 解析后的可安装资产列表（skills/rules/hooks） */
export type ResolvedManifestAssets = {
  version: string;
  skills: string[];
  rules: string[];
  hooks: Record<string, HookConfig>;
};

/** 安装管线使用的完整 Manifest（基座 + 已解析列表） */
export type Manifest = AssetManifest & {
  skills: string[];
  rules?: string[];
  hooks?: Record<string, HookConfig>;
};

const DEFAULT_LANG_CONTENT_DIRS = ['skills', 'commands', 'templates', 'adapters', 'policies'];

/** 语言内容在 assets 下的目录名（兼容 en/zh 子目录与 skills-zh 平铺） */
export function getLanguageContentRoots(lang: Language): string[] {
  if (lang === 'zh') {
    return ['zh', 'skills-zh'];
  }
  return ['en', 'skills'];
}

async function walkFilesSafe(rootDir: string, relativeTo: string): Promise<string[]> {
  if (!(await fileExists(rootDir))) {
    return [];
  }

  const results: string[] = [];

  async function walk(current: string): Promise<void> {
    const entries = await readDir(current);
    for (const entry of entries) {
      const fullPath = path.join(current, entry);
      if (await isDirectory(fullPath)) {
        await walk(fullPath);
      } else {
        results.push(path.relative(relativeTo, fullPath).split(path.sep).join('/'));
      }
    }
  }

  await walk(rootDir);
  return results;
}

async function collectLangContentPaths(
  assetsDir: string,
  lang: Language,
  contentDirs: string[],
): Promise<string[]> {
  const paths = new Set<string>();

  for (const langRoot of getLanguageContentRoots(lang)) {
    for (const contentDir of contentDirs) {
      const scanRoot = path.join(assetsDir, langRoot, contentDir);
      const files = await walkFilesSafe(scanRoot, scanRoot);
      for (const file of files) {
        paths.add(`${contentDir}/${file}`);
      }
    }
  }

  return [...paths];
}

async function collectSharedRules(
  assetsDir: string,
  langFiles: string[],
  lang: Language,
): Promise<string[]> {
  const rules = new Set<string>();

  for (const langRoot of getLanguageContentRoots(lang)) {
    for (const fileName of langFiles) {
      const candidates = [
        path.join(assetsDir, langRoot, fileName),
        path.join(assetsDir, langRoot, 'skills', fileName),
      ];
      for (const candidate of candidates) {
        if (await fileExists(candidate)) {
          // 实际文件在 skills/ 下时，用 skills/ 前缀便于 resolveAssetSourcePath
          if (candidate.includes(`${path.sep}skills${path.sep}${fileName}`)) {
            rules.add(`skills/${fileName}`);
          } else {
            rules.add(fileName);
          }
          break;
        }
      }
    }
  }

  return [...rules];
}

async function isDirectory(dirPath: string): Promise<boolean> {
  try {
    await readDir(dirPath);
    return true;
  } catch {
    return false;
  }
}

async function collectHooks(assetsDir: string, sharedDirs: string[]): Promise<Record<string, HookConfig>> {
  if (!sharedDirs.includes('hooks')) {
    return {};
  }

  // hooks 脚本实际位于 assets/shared/hooks/
  const hooksDir = path.join(assetsDir, 'shared', 'hooks');
  const files = await walkFilesSafe(hooksDir, hooksDir);
  const hooks: Record<string, HookConfig> = {};

  for (const file of files) {
    if (!file.endsWith('.sh')) {
      continue;
    }
    const baseName = path.basename(file, '.sh');
    hooks[`hooks/${file}`] = {
      matcher: 'Write|Edit',
      description: `Polaris phase guard (${baseName})`,
    };
  }

  return hooks;
}

/**
 * 收集 assets/shared/<dirName> 下文件，返回形如 `<dirName>/rel` 的路径列表。
 */
export async function collectSharedDirFiles(
  assetsDir: string,
  dirName: string,
): Promise<string[]> {
  const sharedDir = path.join(assetsDir, 'shared', dirName);
  const files = await walkFilesSafe(sharedDir, sharedDir);
  return files.map((file) => `${dirName}/${file}`);
}

/** 读取 assets/manifest.json */
export async function readAssetManifest(assetsDir: string): Promise<AssetManifest> {
  const manifestPath = path.join(assetsDir, 'manifest.json');
  if (!(await fileExists(manifestPath))) {
    throw new Error(`Manifest not found at ${manifestPath}`);
  }
  return readJson<AssetManifest>(manifestPath);
}

/** 按语言读取完整 manifest（基座 + 已解析 skills/rules/hooks 列表） */
export async function readManifest(lang: Language = 'en'): Promise<Manifest> {
  const assetsDir = getAssetsDir();
  const base = await readAssetManifest(assetsDir);
  const resolved = await resolveManifestAssets(assetsDir, lang, base);
  return {
    ...base,
    skills: resolved.skills,
    rules: resolved.rules,
    hooks: resolved.hooks,
  };
}

/** 仅返回 skills 路径列表 */
export async function getManifestSkills(lang: Language = 'en'): Promise<string[]> {
  const manifest = await readManifest(lang);
  return manifest.skills;
}

/** 按语言解析可分发资产路径 */
export async function resolveManifestAssets(
  assetsDir: string,
  lang: Language,
  manifest?: AssetManifest,
): Promise<ResolvedManifestAssets> {
  const loaded = manifest ?? (await readAssetManifest(assetsDir));
  const contentDirs = loaded.langContentDirs ?? DEFAULT_LANG_CONTENT_DIRS;
  const langFiles = loaded.langFiles ?? [];

  // 旧版 manifest 显式列表优先合并
  const scannedSkills = await collectLangContentPaths(assetsDir, lang, contentDirs);
  const skills = [...new Set([...(loaded.skills ?? []), ...scannedSkills])];

  const scannedRules = await collectSharedRules(assetsDir, langFiles, lang);
  const rules = [...new Set([...(loaded.rules ?? []), ...scannedRules])];

  const scannedHooks = await collectHooks(assetsDir, loaded.sharedDirs ?? []);
  const hooks = { ...(loaded.hooks ?? {}), ...scannedHooks };

  return {
    version: loaded.version,
    skills,
    rules,
    hooks,
  };
}

/** 解析 skill/rule 等资产在磁盘上的源文件路径 */
export async function resolveAssetSourcePath(
  assetsDir: string,
  lang: Language,
  assetRelPath: string,
): Promise<string | null> {
  const candidates: string[] = [];
  const normalized = assetRelPath.replace(/\\/g, '/');

  // shared/ 资产（hooks、templates）
  if (
    normalized.startsWith('hooks/') ||
    normalized.startsWith('templates/') ||
    normalized.startsWith('scorers/')
  ) {
    candidates.push(path.join(assetsDir, 'shared', normalized));
  }

  for (const langRoot of getLanguageContentRoots(lang)) {
    candidates.push(path.join(assetsDir, langRoot, assetRelPath));
  }

    // 兼容 contentDir 前缀与平铺目录：skills/foo → skills-zh/foo
  const parts = assetRelPath.split('/');
  if (parts.length > 1) {
    const [, ...rest] = parts;
    const flatPath = rest.join('/');
    for (const langRoot of getLanguageContentRoots(lang)) {
      candidates.push(path.join(assetsDir, langRoot, flatPath));
    }
    candidates.push(path.join(assetsDir, lang, flatPath));
  }

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  return null;
}