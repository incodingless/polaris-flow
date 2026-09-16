/**
 * assets/manifest.json 解析、语言资产路径解析，以及发布包 `assets/` 源路径助手。
 */
import path from 'path';
import { fileURLToPath } from 'url';

import { fileExists, walkFilesSafe } from '../../utils/file-system.js';
import { readJson } from '../../utils/json-io.js';
import type { Languages } from '../config/polaris-project-config.js';

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

/** 返回任务 state 模板源：`assets/shared/templates/<filename>` */
export function getTaskStateTemplateSrc(filename: string): string {
  return path.join(getSharedTemplatesDir(), filename);
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
  /** 安装时跳过的路径：精确、`dir/name` 树下同名、或纯 basename（如 `README.md`） */
  ignoredFiles?: string[];

  langDirAssets: AssetDir[];
  langFileAssets: AssetFile[];
  sharedAssets: AssetDir[];
};

/**
 * 将 ignoredFiles 规范为 posix 路径集合（trim、反斜杠→`/`、去空）。
 */
export function normalizeIgnoredFiles(list: string[] | undefined): Set<string> {
  const out = new Set<string>();
  if (!list) return out;
  for (const raw of list) {
    const normalized = raw.trim().replace(/\\/g, '/');
    if (normalized) out.add(normalized);
  }
  return out;
}

/**
 * 判断相对语言根 / shared 根的路径是否应忽略。
 * - 精确匹配：`skills/README.md`
 * - 仅 basename：`README.md` / `.DS_Store` → 任意目录下同名文件
 * - `dir/name`：该 dir 树下任意同名 basename（如 `skills/.DS_Store` → `skills/prd/.DS_Store`）
 */
export function isIgnoredAssetPath(relFromRoot: string, ignored: Set<string>): boolean {
  const rel = relFromRoot.replace(/\\/g, '/');
  if (!rel || ignored.size === 0) return false;
  if (ignored.has(rel)) return true;

  const base = rel.includes('/') ? rel.slice(rel.lastIndexOf('/') + 1) : rel;

  for (const pattern of ignored) {
    if (!pattern.includes('/')) {
      if (base === pattern) return true;
      continue;
    }
    const slash = pattern.lastIndexOf('/');
    const prefix = pattern.slice(0, slash);
    const patternBase = pattern.slice(slash + 1);
    if (base !== patternBase) continue;
    if (rel === pattern || rel.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

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
export async function readAssets(lang: Languages = 'zh'): Promise<Assets> {
  const assetsDir = getAssetsDir();
  const manifest = await loadManifestConfig(assetsDir);
  const ignored = normalizeIgnoredFiles(manifest.ignoredFiles);
  const langDirAssets = await collectContentPaths(
    path.join(assetsDir, lang),
    manifest.langContentDirs,
    ignored,
  );
  const langFileAssets = await collectFilePaths(
    path.join(assetsDir, lang),
    manifest.langFiles,
    ignored,
  );
  const sharedAssets = await collectContentPaths(
    path.join(assetsDir, 'shared'),
    manifest.sharedDirs,
    ignored,
  );
  return {
    langDirAssets,
    langFileAssets,
    sharedAssets,
  };
}

/**
 * 收集指定目录下的文件，返回目录及文件绝对路径列表。
 * `ignored` 中的键为相对语言/shared 根的精确路径（如 `skills/README.md`）。
 */
async function collectContentPaths(
  assetsDir: string,
  contentDirs: string[],
  ignored: Set<string> = new Set(),
): Promise<AssetDir[]> {
  const dirs = new Array<AssetDir>();
  for (const contentDir of contentDirs) {
    const scanRoot = path.join(assetsDir, contentDir);
    const paths = new Array<AssetFile>();
    const files = await walkFilesSafe(scanRoot, scanRoot);
    const contentDirNorm = contentDir.replace(/\\/g, '/');

    for (const file of files) {
      const shortPath = file.replace(/\\/g, '/');
      const relFromRoot = `${contentDirNorm}/${shortPath}`;
      if (isIgnoredAssetPath(relFromRoot, ignored)) {
        continue;
      }
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

/**
 * 收集语言根下的单文件资产；命中 ignored 的 shortPath 跳过。
 */
async function collectFilePaths(
  assetsDir: string,
  files: string[],
  ignored: Set<string> = new Set(),
): Promise<AssetFile[]> {
  const assetFiles = new Array<AssetFile>();
  for (const file of files) {
    const shortPath = file.replace(/\\/g, '/');
    if (isIgnoredAssetPath(shortPath, ignored)) {
      continue;
    }
    assetFiles.push({
      shortPath: file,
      fullPath: path.join(assetsDir, file),
    });
  }
  return assetFiles;
}