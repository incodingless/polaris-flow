/**
 * 外部技能落盘执行器：把 GitHub clone 或本地目录中的 skills 子树拷到平台目标。
 * 只服务「已拿到源目录」之后的复制环节，获取通道见各 installer。
 *
 * 入参用 registry 的 `SkillsPlacement`（只含落盘位置），不关心依赖是谁。
 */
import path from 'path';
import fs from 'fs/promises';

import { copyDirContents, copyFile, ensureDir } from '../../utils/file-system.js';
import type { SkillsPlacement } from '../deps/registry.js';
import { type Platform, getPlatformSkillsDir } from '../domain/platforms.js';
import type { InstallScope, Languages } from '../config/polaris-project-config.js';

/** 将 assets 内语言路径 zh/ → en/（与 getLanguageContentRoots 策略一致） */
function resolveLangPath(assetPath: string, lang: Languages): string {
  if (lang === 'zh') return assetPath;
  return assetPath.replace(/^zh\//, 'en/').replace(/^skills-zh\//, 'skills/');
}

/**
 * 从已获取的源目录复制 skills（及 extraPaths）到平台目录。
 * @param placement 落盘位置声明（skillsPath / targetDir / extraPaths）
 * @param repoPath 上游仓库或本地目录的根
 */
export async function installSource(
  placement: SkillsPlacement,
  repoPath: string,
  baseDir: string,
  platform: Platform,
  scope: InstallScope,
  lang?: Languages,
): Promise<void> {
  // getPlatformSkillsDir 已含 baseDir，禁止再 path.join(baseDir, ...)（Node path.join 不丢弃绝对段）
  const platformSkillsRoot = getPlatformSkillsDir(platform, scope, baseDir);
  await ensureDir(platformSkillsRoot);

  const l = lang ?? 'zh';

  if (placement.skillsPath) {
    const resolvedPath = resolveLangPath(placement.skillsPath, l);
    const srcSkills = path.join(repoPath, resolvedPath);
    const destSkills = path.join(platformSkillsRoot, placement.targetDir ?? '');
    await copyDirContents(srcSkills, destSkills);
  }

  if (placement.extraPaths) {
    for (const ep of placement.extraPaths) {
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
      const destPath = path.join(platformSkillsRoot, placement.targetDir ?? '', destRel);

      if (stat.isDirectory()) {
        await copyDirContents(srcActual, destPath);
      } else {
        await copyFile(srcActual, destPath);
      }
    }
  }
}
