/**
 * assets/manifest.json 解析与语言资产路径解析。
 * 负责解析 assets/manifest.json 文件，并返回语言资产路径列表。
 */
import path from 'path';

import { fileExists, walkFilesSafe } from '../../utils/file-system.js';
import { readJson } from '../../utils/json-io.js';
import type { Language } from '../config/polaris-project-config.js';
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

export type AssetManifestFile = {
  name: string;
  path: string;
  type: 'file' | 'dir';
}

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
export async function readAssets(lang: Language = 'zh'): Promise<Asset> {
  const assetsDir = getAssetsDir();
  const manifest = await loadManifestConfig(assetsDir);
  const langContentPaths = await collectContentPaths(path.join(assetsDir, lang), manifest.langContentDirs);
  const langContentFiles = await collectContentPaths(path.join(assetsDir, lang), manifest.langFiles);
  const sharedAssets = await collectContentPaths(path.join(assetsDir, 'shared'), manifest.sharedDirs);
  return {
    langContentPaths,
    langContentFiles,
    sharedAssets
  };
}

/**
 * 收集指定目录下的文件，返回目录及文件绝对路径列表
 * @param assetsDir assets 目录
 * @param contentDirs 内容目录列表
 * @returns 
 */
async function collectContentPaths(
  assetsDir: string,
  contentDirs: string[],
): Promise<string[]> {
  const paths = new Array<string>();
  for (const contentDir of contentDirs) {
    const scanRoot = path.join(assetsDir, contentDir);
    const files = await walkFilesSafe(scanRoot, scanRoot);
    for (const file of files) {
      paths.push(path.join(contentDir, file));
    }
  }
  return paths;
}