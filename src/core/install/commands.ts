/**
 * 平台 slash command 安装：把 assets 内 commands/ 落到各宿主的命令目录。
 * installSource（外部源复用）在 source-installer.ts。
 *
 * 两个分隔符占位符各自独立展开，互不替代（Trae 就是「技能 flat、命令 nested」）：
 * - `{{SKN_SPR}}` → 技能名分隔符，按 **skillsLayout**：nested → `:`；flat → `-`
 * - `{{CMD_SPR}}` → 命令名分隔符，按 **commandLayout**：nested → `:`；flat → `-`
 * 这样命令体内引用的技能名 / 命令名都与该平台实际落盘的名字一致。
 *
 * 命令落盘路径按 **commandLayout**（命令根由 install/layout.ts 决定）：
 * - nested → `<contextDir>/commands/polaris/<相对路径>`
 * - flat → `<contextDir>/commands/polaris-<相对路径，/ → ->.md`
 */
import path from 'path';
import { readFile, writeFile } from 'fs/promises';

import {
  ensureDir,
  fileExists,
  runCopyJobs,
  type CopyJob,
  type CopyResult,
} from '../../utils/file-system.js';
import type { CommandLayout, SkillsLayout } from '../domain/platforms.js';
import { Assets } from '../assets/manifest.js';
import { POLARIS_PLUGIN_NAME } from '../config/polaris-constants.js';
import { applySkillNamePrefix, resolveSkillNamePrefix } from './skills.js';

/** 安装 Polaris bundled 命令（读取 assets 内 commands/） */

/** 命令名分隔符占位符（按 commandLayout 展开为 `:` 或 `-`） */
export const COMMAND_NAME_PREFIX_PLACEHOLDER = '{{CMD_SPR}}';

/** flat 命令的文件名前缀，兼作命名空间替代（如 `polaris-coding-normal.md`） */
const FLAT_COMMAND_PREFIX = `${POLARIS_PLUGIN_NAME}-`;

/**
 * 解析命令相对落盘路径（相对命令根）。
 * - nested：原样保留相对路径（子目录即命名空间，由宿主推导为 `:` 命名空间）
 * - flat：`polaris-` 前缀 + 路径段以 `-` 连接 + `.md`
 * @param shortPath 资产内相对路径，如 `coding/normal.md`
 * @param layout 平台命令布局
 * @returns 相对命令根的落盘路径
 */
export function resolveCommandDest(shortPath: string, layout: CommandLayout): string {
  if (layout !== 'flat') {
    return shortPath;
  }
  const flatName = shortPath.replace(/\.md$/i, '').split('/').join('-');
  return `${FLAT_COMMAND_PREFIX}${flatName}.md`;
}

/**
 * 写出单个命令文件：覆盖策略 + 占位符展开。
 * @param job 拷贝任务
 * @param skillPrefix 技能名分隔符（按 skillsLayout）
 * @param commandPrefix 命令名分隔符（按 commandLayout）
 * @returns 拷贝结果
 */
async function writeCommandFile(
  job: CopyJob,
  skillPrefix: string,
  commandPrefix: string,
): Promise<CopyResult> {
  const existed = await fileExists(job.dest);
  if (existed && !job.overwrite) {
    return { job, result: 'skipped' };
  }
  const raw = await readFile(job.src, 'utf-8');
  const rewritten = applySkillNamePrefix(raw, skillPrefix).replaceAll(
    COMMAND_NAME_PREFIX_PLACEHOLDER,
    commandPrefix,
  );
  await ensureDir(path.dirname(job.dest));
  await writeFile(job.dest, rewritten, 'utf-8');
  return { job, result: 'copied' };
}

/**
 * 安装 commands 到指定平台
 * @param commandsDir 命令根：nested 为 `<contextDir>/commands/polaris`，flat 为 `<contextDir>/commands`
 * @param overwrite 是否覆盖
 * @param asset 资产
 * @param skillsLayout 平台技能布局，决定 `{{SKN_SPR}}` 展开成的分隔符
 * @param commandLayout 平台命令布局，决定落盘路径扁平化与 `{{CMD_SPR}}` 展开
 * @returns 拷贝结果
 */
export async function installPolarisCommandsForPlatform(
  commandsDir: string,
  overwrite: boolean,
  asset: Assets,
  skillsLayout: SkillsLayout,
  commandLayout: CommandLayout = 'nested',
): Promise<{ copied: number; skipped: number }> {
  const skillPrefix = resolveSkillNamePrefix(skillsLayout);
  const commandPrefix = commandLayout === 'flat' ? '-' : ':';
  const commandDirs = asset.langDirAssets.filter((asset) => ['commands'].includes(asset.dir));
  const jobs: CopyJob[] = [];
  for (const commandDir of commandDirs) {
    for (const file of commandDir.files) {
      const job: CopyJob = {
        label: commandDir.dir,
        src: file.fullPath,
        dest: path.join(commandsDir, resolveCommandDest(file.shortPath, commandLayout)),
        type: 'file',
        overwrite: overwrite,
      };
      job.write = () => writeCommandFile(job, skillPrefix, commandPrefix);
      jobs.push(job);
    }
  }
  return runCopyJobs(jobs);
}
