/**
 * assets/manifest.json 解析、语言资产路径解析，以及发布包 `assets/` 源路径助手。
 */
import path from 'path';
import { fileURLToPath } from 'url';

import { fileExists, walkFilesSafe } from '../../utils/file-system.js';
import { readJson } from '../../utils/json-io.js';
import type { Language } from '../config/polaris-project-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

//---------------------------------
//         发布包 assets 源
//---------------------------------

/** 返回发布包/仓库根下的 assets 目录 */
export function getAssetsDir(): string {
  return path.resolve(__dirname, '..', '..', '..', 'assets');
}

/** 返回 `assets/shared` */
export function getSharedDir(): string {
  return path.join(getAssetsDir(), 'shared');
}

/** 返回 `assets/shared/templates` */
export function getSharedTemplatesDir(): string {
  return path.join(getSharedDir(), 'templates');
}

/** 返回全局 polaris 模板源：`assets/shared/templates/polaris.example.yaml` */
export function getGlobalPolarisConfigSrc(): string {
  return path.join(getSharedTemplatesDir(), 'polaris.example.yaml');
}

/** 返回项目 config 模板源：`assets/shared/templates/config.example.yaml` */
export function getConfigExampleYamlSrc(): string {
  return path.join(getSharedTemplatesDir(), 'config.example.yaml');
}

/** 返回 workflow 模板源：`assets/shared/templates/workflow-template.yaml` */
export function getWorkflowTemplateYamlSrc(): string {
  return path.join(getSharedTemplatesDir(), 'workflow-template.yaml');
}

/** 返回 shared .gitignore 源：`assets/shared/.gitignore` */
export function getSharedGitignoreSrc(): string {
  return path.join(getSharedDir(), '.gitignore');
}

//---------------------------------
//         Manifest 解析
//---------------------------------

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

  langDirAssets: AssetDir[];
  langFileAssets: AssetFile[];
  sharedAssets: AssetDir[];
};

export type AssetDir = {
  dir: string;
  files: AssetFile[];
}

export type AssetFile = {
  shortPath: string;
  fullPath: string;
}

export type Assets = {
  langDirAssets: AssetDir[];
  langFileAssets: AssetFile[];
  sharedAssets: AssetDir[];
}

export async function loadManifestConfig(assetsDir: string): Promise<AssetManifest> {
  const manifestPath = path.join(assetsDir, 'manifest.json');
  if (!(await fileExists(manifestPath))) {
    throw new Error(`Manifest not found at ${manifestPath}`);
  }
  const manifest = await readJson<AssetManifest>(manifestPath);
  return manifest;
}

/** 读取 assets/manifest.json, 按语言读取完整 assets（基座 + 已解析 skills/rules/hooks 列表） */
export async function readAssets(lang: Language = 'zh'): Promise<Assets> {
  const assetsDir = getAssetsDir();
  const manifest = await loadManifestConfig(assetsDir);
  const langDirAssets =  await collectContentPaths(path.join(assetsDir, lang), manifest.langContentDirs);
  const langFileAssets =  await collectFilePaths(path.join(assetsDir, lang), manifest.langFiles);
  const sharedAssets =  await collectContentPaths(path.join(assetsDir, 'shared'), manifest.sharedDirs);
  return {
    langDirAssets,
    langFileAssets,
    sharedAssets,
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
): Promise<AssetDir[]> {
  const dirs = new Array<AssetDir>();
  for (const contentDir of contentDirs) {
    const scanRoot = path.join(assetsDir, contentDir);
    const paths = new Array<AssetFile>();
    const files = await walkFilesSafe(scanRoot, scanRoot);
    
    for (const file of files) {
      paths.push({
        shortPath: file,
        fullPath: path.join(assetsDir, contentDir, file),
      });
    }

    dirs.push({
      dir: contentDir,
      files: paths,
    });
  }
  return dirs;
}

async function collectFilePaths(
  assetsDir: string,
  files: string[],
): Promise<AssetFile[]> {
  const assetFiles = new Array<AssetFile>();
  for (const file of files) {
    assetFiles.push({
      shortPath: file,
      fullPath: path.join(assetsDir, file),
    });
  }
  return assetFiles;
}