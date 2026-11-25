/**
 * 平台 slash command 安装：把 assets 内 commands/ 落到各宿主的命令目录。
 * installSource（外部源复用）在 source-installer.ts。
 *
 * 三个占位符各自独立展开，互不替代：
 * - `{{SKN_SPR}}` → 技能名分隔符，按 **skillsLayout**：nested → `:`；flat → `-`
 * - `{{CMD_SPR}}` → 命令名分隔符，按 **commandLayout**：nested / namespaced-flat → `:`；flat → `-`
 * - `{{CMD_NS}}` → frontmatter `name` 的命名空间前缀：仅 `namespaced-flat` 的分类命令
 *   展开为 `<分类>:`（如 `coding:`），其余布局与顶层命令展开为空
 *
 * `namespaced-flat`（Trae / Trae-CN）把分类压进文件名、`psfl/` 只留一层；宿主不再从
 * 路径推导分类层级，故由 `name` 把命名空间带回来（`name: coding:normal`），使菜单命令名
 * 仍为 `/psfl:coding:normal`，与 `triggers` 和正文里的跨命令引用一致。
 *
 * 命令落盘路径按 **commandLayout**（命令根由 install/layout.ts 决定）：
 * - nested → `<contextDir>/commands/psfl/<相对路径>`
 * - flat → `<contextDir>/commands/psfl-<相对路径，/ → ->.md`（Cursor：触发名 = 文件名）
 * - namespaced-flat → `<contextDir>/commands/psfl/<相对路径，/ → ->.md`（分类压进文件名）
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
import { POLARIS_COMMAND_PREFIX } from '../config/polaris-constants.js';
import { applySkillNamePrefix, resolveSkillNamePrefix } from './skills.js';
import type { CopyStats } from './types.js';

/** 安装 Polaris bundled 命令（读取 assets 内 commands/） */

/** 命令名分隔符占位符（按 commandLayout 展开为 `:` 或 `-`） */
export const COMMAND_NAME_PREFIX_PLACEHOLDER = '{{CMD_SPR}}';

/** frontmatter `name` 的命名空间前缀占位符（见 resolveCommandNamespace） */
export const COMMAND_NAMESPACE_PLACEHOLDER = '{{CMD_NS}}';

/** flat 命令的文件名前缀，兼作命名空间替代（如 `psfl-coding-normal.md`） */
const FLAT_COMMAND_PREFIX = `${POLARIS_COMMAND_PREFIX}-`;

/**
 * 展开命令名分隔符，使 `triggers` 与正文引用匹配宿主实际推导出的命令名。
 * - `nested` / `namespaced-flat`：全部 `:`（后者由 `name` 补回分类命名空间）
 * - `flat`：全部 `-`（Cursor 命令名 = 文件名）
 */
export function expandCommandNames(raw: string, layout: CommandLayout): string {
  return raw.replaceAll(COMMAND_NAME_PREFIX_PLACEHOLDER, layout === 'flat' ? '-' : ':');
}

/**
 * 解析 frontmatter `name` 的命名空间前缀。
 * `namespaced-flat` 把分类压进了文件名，宿主无法再从路径推导分类层级，故把
 * `<分类>:` 注入 `name`（`coding/normal.md` → `coding:`，使 `name: coding:normal`）。
 * 其余布局从路径 / 文件名推导命令名，`name` 保持裸 stem；顶层命令无分类，一律为空。
 * @param shortPath 资产内相对路径，如 `coding/normal.md`
 * @param layout 平台命令布局
 */
export function resolveCommandNamespace(shortPath: string, layout: CommandLayout): string {
  if (layout !== 'namespaced-flat') return '';
  const dirs = shortPath.replace(/\.md$/i, '').split('/').slice(0, -1);
  return dirs.length ? `${dirs.join(':')}:` : '';
}

/**
 * 解析命令相对落盘路径（相对命令根）。
 * - nested：原样保留相对路径（子目录即命名空间，由宿主推导为 `:` 命名空间）
 * - flat：`psfl-` 前缀 + 路径段以 `-` 连接 + `.md`
 * - namespaced-flat：路径段以 `-` 连接 + `.md`（命名空间由命令根 `commands/psfl/` 提供）
 * @param shortPath 资产内相对路径，如 `coding/normal.md`
 * @param layout 平台命令布局
 * @returns 相对命令根的落盘路径
 */
export function resolveCommandDest(shortPath: string, layout: CommandLayout): string {
  if (layout === 'nested') {
    return shortPath;
  }
  const flatName = `${shortPath.replace(/\.md$/i, '').split('/').join('-')}.md`;
  return layout === 'flat' ? `${FLAT_COMMAND_PREFIX}${flatName}` : flatName;
}

/**
 * 写出单个命令文件：覆盖策略 + 占位符展开。
 * @param job 拷贝任务
 * @param skillPrefix 技能名分隔符（按 skillsLayout）
 * @param commandLayout 平台命令布局
 * @param shortPath 资产内相对路径，决定 `{{CMD_NS}}` 的展开
 * @returns 拷贝结果
 */
async function writeCommandFile(
  job: CopyJob,
  skillPrefix: string,
  commandLayout: CommandLayout,
  shortPath: string,
): Promise<CopyResult> {
  const existed = await fileExists(job.dest);
  if (existed && !job.overwrite) {
    return { job, result: 'skipped' };
  }
  const raw = await readFile(job.src, 'utf-8');
  const rewritten = expandCommandNames(
    applySkillNamePrefix(raw, skillPrefix).replaceAll(
      COMMAND_NAMESPACE_PLACEHOLDER,
      resolveCommandNamespace(shortPath, commandLayout),
    ),
    commandLayout,
  );
  await ensureDir(path.dirname(job.dest));
  await writeFile(job.dest, rewritten, 'utf-8');
  return { job, result: 'copied' };
}

/**
 * 安装 commands 到指定平台
 * @param commandsDir 命令根：nested / namespaced-flat 为 `<contextDir>/commands/psfl`，flat 为 `<contextDir>/commands`
 * @param overwrite 是否覆盖
 * @param asset 资产
 * @param skillsLayout 平台技能布局，决定 `{{SKN_SPR}}` 展开成的分隔符
 * @param commandLayout 平台命令布局，决定落盘路径与占位符展开
 * @returns 拷贝计数与落盘文件清单（含未改写的既有文件）
 */
export async function installPolarisCommandsForPlatform(
  commandsDir: string,
  overwrite: boolean,
  asset: Assets,
  skillsLayout: SkillsLayout,
  commandLayout: CommandLayout = 'nested',
): Promise<CopyStats> {
  const skillPrefix = resolveSkillNamePrefix(skillsLayout);
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
      job.write = () => writeCommandFile(job, skillPrefix, commandLayout, file.shortPath);
      jobs.push(job);
    }
  }
  const result = await runCopyJobs(jobs);
  return {
    copied: result.copied,
    skipped: result.skipped,
    files: result.results.map((entry) => entry.job.dest),
  };
}
