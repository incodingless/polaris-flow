/**
 * assets/manifest.json 解析与语言资产路径解析。
 * 负责解析 assets/manifest.json 文件，并返回语言资产路径列表。
 */
import path from 'path';

import { fileExists, walkFilesSafe } from '../../utils/file-system.js';
import { readJson } from '../../utils/json-io.js';
import type { Language } from '../config/polaris-config.js';
import { getAssetsDir } from './polaris-paths.js';

/** Manifest 中单个 hook 条目 */
export type HookConfig = {
  matcher: string;
  description: string;
};

/** assets/manifest.json 结构 */
export type AssetManifest = {
  version: string;
  languages?: Array<{ id: string; name: string }>;
  langContentDirs: string[];
  langFiles: string[];
  sharedDirs: string[];
};

/** 安装管线使用的完整资产列表 */
export type Asset = {
  langContentPaths: string[];
  langContentFiles: string[];
  sharedAssets: string[];
};

/** 读取 assets/manifest.json */
export async function loadManifestConfig(assetsDir: string): Promise<AssetManifest> {
  const manifestPath = path.join(assetsDir, 'manifest.json');
  if (!(await fileExists(manifestPath))) {
    throw new Error(`Manifest not found at ${manifestPath}`);
  }
  return readJson<AssetManifest>(manifestPath);
}

/** 按语言读取完整 manifest（基座 + 已解析 skills/rules/hooks 列表） */
export async function readAssets(lang: Language = 'en'): Promise<Asset> {
  const assetsDir = getAssetsDir();
  const manifest = await loadManifestConfig(assetsDir);
  const langContentPaths = await collectLangContentPaths(assetsDir, lang, manifest.langContentDirs);
  const langContentFiles = await collectLangContentFiles(assetsDir, lang, manifest.langFiles);
  const sharedAssets = await collectSharedAssets(assetsDir, manifest.sharedDirs);
  return {
    langContentPaths,
    langContentFiles,
    sharedAssets
  };
}

/**
 * 收集 assets/<lang>/<contentDir> 下文件，返回形如 `<lang>/<contentDir>/<file>` 的路径列表。
 * @param assetsDir assets 目录
 * @param lang 语言
 * @param contentDirs 内容目录列表
 * @returns 
 */
async function collectLangContentPaths(
  assetsDir: string,
  lang: Language,
  contentDirs: string[],
): Promise<string[]> {
  const paths = new Set<string>();
  for (const contentDir of contentDirs) {
    const scanRoot = path.join(assetsDir, lang, contentDir);
    const files = await walkFilesSafe(scanRoot, scanRoot);
    for (const file of files) {
      paths.add(`${contentDir}/${file}`);
    }
  }
  return [...paths];
}

/**
 * 收集 assets/<lang>/<fileName> 下文件，返回形如 `<lang>/<fileName>` 的路径列表。
 * @param assetsDir assets 目录
 * @param lang 语言
 * @param fileNames 文件名列表
 * @returns 
 */
async function collectLangContentFiles(
  assetsDir: string,
  lang: Language,
  fileNames: string[],
): Promise<string[]> {
  const paths = new Set<string>();
  for (const fileName of fileNames) {
      paths.add(path.join(assetsDir, lang, fileName));
  }
  return [...paths];
}

/**
 * 收集 assets/shared/<dirName> 下文件，返回形如 `<dirName>/rel` 的路径列表。
 * @param assetsDir assets 目录
 * @param dirNames 目录名列表
 * @returns 
 */
export async function collectSharedAssets(
  assetsDir: string,
  dirNames: string[],
): Promise<string[]> {
  const paths = new Set<string>();
  for (const dirName of dirNames) {
    const sharedDir = path.join(assetsDir, 'shared', dirName);
    const files = await walkFilesSafe(sharedDir, sharedDir);
    for (const file of files) {
      paths.add(`${dirName}/${file}`);
    }
  }
  return [...paths];
}