/**
 * 读取并解析 assets manifest（含 skills/rules/hooks 列表）。
 */
import {
  readAssetManifest,
  resolveManifestAssets,
  type AssetManifest,
  type HookConfig,
} from '../assets/manifest.js';
import { getAssetsDir } from '../assets/paths.js';

/** 安装管线使用的完整 Manifest（基座 + 已解析列表） */
export type Manifest = AssetManifest & {
  skills: string[];
  rules?: string[];
  hooks?: Record<string, HookConfig>;
};

/** 按语言读取完整 manifest */
export async function readManifest(lang: 'en' | 'zh' = 'en'): Promise<Manifest> {
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
export async function getManifestSkills(lang: 'en' | 'zh' = 'en'): Promise<string[]> {
  const manifest = await readManifest(lang);
  return manifest.skills;
}
