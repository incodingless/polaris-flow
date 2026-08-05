/**
 * SkillSource 执行器：把 GitHub clone 或 bundled 仓库中的 skills 目录拷贝到平台目标。
 * 供 install/commands.ts 与 deps/superpowers.ts 复用，避免 deps 反向依赖 install/commands。
 */
import path from 'path';
import fs from 'fs/promises';

import { copyDirContents, copyFile, ensureDir } from '../../utils/file-system.js';
import type { SkillSource } from '../assets/sources.js';
import { type Platform, getPlatformSkillsDir } from '../platforms.js';
import type { InstallScope, Language } from '../config/polaris-project-config.js';

/** 将 assets 内语言路径 zh/ → en/（与 getLanguageContentRoots 策略一致） */
function resolveLangPath(assetPath: string, lang: Language): string {
  if (lang === 'zh') return assetPath;
  return assetPath.replace(/^zh\//, 'en/').replace(/^skills-zh\//, 'skills/');
}

/**
 * 从 GitHub clone 或 bundled 仓库复制 skills 到平台目录。
 */
export async function installSource(
  source: SkillSource,
  repoPath: string,
  baseDir: string,
  platform: Platform,
  scope: InstallScope,
  lang?: Language,
): Promise<void> {
  // getPlatformSkillsDir 已含 baseDir，禁止再 path.join(baseDir, ...)（Node path.join 不丢弃绝对段）
  const platformSkillsRoot = getPlatformSkillsDir(platform, scope, baseDir);
  await ensureDir(platformSkillsRoot);

  const l = lang ?? 'zh';

  if (source.skillsPath) {
    const resolvedPath = resolveLangPath(source.skillsPath, l);
    const srcSkills = path.join(repoPath, resolvedPath);
    const destSkills = path.join(platformSkillsRoot, source.targetDir ?? '');
    await copyDirContents(srcSkills, destSkills);
  }

  if (source.extraPaths) {
    for (const ep of source.extraPaths) {
      const langEp = resolveLangPath(ep, l);
      const srcExtra = path.join(repoPath, langEp);
      let srcActual = srcExtra;
      let stat = await fs.stat(srcExtra).catch(() => null);

      if (!stat && langEp !== ep) {
        srcActual = path.join(repoPath, ep);
        stat = await fs.stat(srcActual).catch(() => null);
      }

      if (!stat) continue;

      const destRel = ep.replace(/^assets\/(zh|en|shared)\//, '').replace(/^zh\//, '');
      const destPath = path.join(platformSkillsRoot, source.targetDir ?? '', destRel);

      if (stat.isDirectory()) {
        await copyDirContents(srcActual, destPath);
      } else {
        await copyFile(srcActual, destPath);
      }
    }
  }
}
