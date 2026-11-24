/**
 * 依赖「获取」阶段的分派执行器。
 *
 * 输入是 registry 的一条声明，输出统一的 `{ status }`——init 因此不再为每个
 * 组件手写一段安装 + 日志 + lock 记录（历史上 5 段近乎复制粘贴的代码）。
 *
 * 分派依据 `resolveInstallerId(spec)`：
 * - `openspec` / `codegraph`：CLI + 项目级初始化，走各自专门实现
 * - `superpowers`：npx skills CLI，含 agent 名映射与三级回退
 * - `github-copy`：GitHub 浅克隆到本地组件目录（平台落盘由 polaris 分发步骤完成）
 * - `npm-cli`：通用「npm i -g → git → 本地目录」通道，新增纯 CLI 依赖直接走这条
 *
 * Polaris 自身不在此层：它随 npm 包分发，由 `installPolarisForPlatform` 逐平台落盘。
 */
import { execFileSync } from 'child_process';
import path from 'path';

import { installOpenSpec, getNpmExecutable } from '../integrations/openspec.js';
import { installSuperpowersForPlatforms } from '../integrations/superpowers.js';
import { installCodegraph } from '../integrations/codegraph.js';
import {
  ensureBundledSkillsSource,
  getBundledSkillsSourceDir,
  importBundledSkillFromDir,
} from '../integrations/bundled-skills.js';
import { getNpmPackageVersion, resolveCliExecutable, resolveCliInstallTarget } from './npm.js';
import { resolveVersion } from './github.js';
import {
  buildNpmGlobalInstallArgs,
  installCliFromGitRepo,
  installCliFromLocalDir,
} from '../install/cli-installer.js';
import { resolveInstallChannelConfig } from '../install/channels.js';
import {
  dependencyMinVersion,
  dependencyPackageName,
  dependencyRepo,
  dependencyTimeoutMs,
  githubCopyDependencies,
  resolveInstallerId,
  toRepoUrl,
  type DependencySpec,
} from './registry.js';
import type { InstallScope } from '../config/polaris-project-config.js';
import type { Platform } from '../domain/platforms.js';
import { fileExists } from '../../utils/file-system.js';

/** 获取阶段上下文 */
export type AcquireContext = {
  projectPath: string;
  scope: InstallScope;
  /** 已选平台（openspec init 需要完整 Platform 对象，不只 id） */
  platforms: Platform[];
};

/**
 * 获取阶段的行为开关。缺省即 init 语义，update 只翻转它真正需要的那一项。
 *
 * 之所以只给一个布尔而不是 `mode: 'init' | 'update'`：init 与 update 对 superpowers 的
 * 期望完全相同，差异只在「CLI 已装是否还要重拉」——用字符串 mode 会诱使后来者给其余
 * installer 开无实据的分支。
 */
export type AcquireOptions = {
  /**
   * 为 true 时，CLI 已安装也要重新拉 @latest（透传给 openspec / codegraph 的
   * `upgradeCli`）。已有 `.codegraph` 索引时仍不重建索引——重建代价高，与「升级 CLI」
   * 是两件事。init 缺省 false：已装即视为就绪，只做项目侧初始化。
   */
  upgradeInstalled?: boolean;
};

/**
 * 统一的依赖安装结果。
 *
 * 不带版本号是有意的：写 lock 的版本由调用方用 `resolveDependencyVersion(spec, outcome)`
 * 从安装产物反查（npm 全局包版本 / 仓库 tag），而 installer 自报的版本在这里无人消费，
 * 却要为此多 spawn 一次 `npm list -g`（实测 0.75s/次）。
 */
export type DependencyOutcome = {
  status: 'installed' | 'failed' | 'skipped';
  /** 逐项失败原因（目前只有 GitHub 拉取产生），供调用方原样打印 */
  errors?: Record<string, string>;
};

/** 从包名推导可执行文件名：`@scope/name` → `name` */
function binNameOf(pkg: string): string {
  const parts = pkg.split('/');
  return parts[parts.length - 1] ?? pkg;
}

/**
 * 通用 npm CLI 通道：npm i -g → git clone → 本地目录。
 * 只负责把可执行文件装上，不碰项目（项目级初始化由组件专属 installer 承担）。
 */
async function acquireGenericNpmCli(
  spec: DependencySpec,
  ctx: AcquireContext,
): Promise<DependencyOutcome> {
  if (spec.method.kind !== 'npm-cli') {
    throw new Error(`acquireGenericNpmCli called with method.kind = ${spec.method.kind}`);
  }
  const pkg = dependencyPackageName(spec);
  const bin = binNameOf(pkg);
  const target = resolveCliInstallTarget();
  const channel = await resolveInstallChannelConfig();
  const registry = channel.npmRegistry;

  // --- 1. npm 通道 ---
  try {
    execFileSync(
      getNpmExecutable(),
      buildNpmGlobalInstallArgs(`${pkg}@latest`, registry, target.prefix),
      {
        cwd: ctx.projectPath,
        stdio: 'inherit',
        timeout: dependencyTimeoutMs(spec),
        shell: process.platform === 'win32',
      },
    );
    if (resolveCliExecutable(bin)) {
      return { status: 'installed' };
    }
  } catch (error) {
    console.warn(
      `    ↳ ${spec.label} npm 安装失败，回退 git 镜像通道: ${(error as Error).message}`,
    );
  }

  // --- 2. git 镜像通道 ---
  const repo = dependencyRepo(spec);
  if (repo) {
    const ok = await installCliFromGitRepo(
      toRepoUrl(repo),
      dependencyMinVersion(spec),
      channel.githubMirror,
      registry,
      target.prefix,
    );
    if (ok && resolveCliExecutable(bin)) {
      return { status: 'installed' };
    }
  }

  // --- 3. 本地目录通道 ---
  const localPath = channel.localPaths[spec.id];
  if (localPath && (await fileExists(localPath))) {
    if (installCliFromLocalDir(localPath, registry, target.prefix) && resolveCliExecutable(bin)) {
      return { status: 'installed' };
    }
  }

  return { status: 'failed' };
}

/** GitHub 浅克隆通道：把单条附带技能拉到本地组件目录 */
async function acquireGithubCopy(spec: DependencySpec): Promise<DependencyOutcome> {
  const sourceDir = getBundledSkillsSourceDir();
  const channel = await resolveInstallChannelConfig();
  const localPath = channel.localPaths[spec.id];

  // 显式配置了本机目录时以该目录为源：拷进组件目录后不再联网，
  // 这样后续平台分发（copyBundledSkillsToPlatform）读的仍是同一载体。
  if (localPath && (await fileExists(path.join(localPath, 'SKILL.md')))) {
    const dep = githubCopyDependencies().find((item) => item.spec.id === spec.id);
    if (dep) {
      await importBundledSkillFromDir(dep, localPath, sourceDir);
      return { status: 'installed' };
    }
  }

  const result = await ensureBundledSkillsSource({ sourceDir, ids: [spec.id] });
  if (result.missing.length === 0) {
    return { status: 'installed' };
  }
  return { status: 'failed', errors: result.errors };
}

/**
 * 解析安装成功后的版本，用于写 `.polaris/install-state.json`。
 *
 * 只有 `trackVersion` 为真的依赖才需要；不可比占位符（`local` / `fetched` / `0.0.0`）
 * 一律返回 null，由调用方跳过——把占位符写进 lock 会让 update 误判为「已装的极旧版本」。
 */
export async function resolveDependencyVersion(
  spec: DependencySpec,
  outcome: DependencyOutcome,
): Promise<string | null> {
  if (outcome.status !== 'installed') return null;

  const { method } = spec;
  if (method.kind === 'npm-cli') {
    const version = getNpmPackageVersion(dependencyPackageName(spec));
    return version === '0.0.0' ? null : version;
  }
  if (method.kind === 'npx-skills') {
    // npx 通道装的是默认分支，tag 只作「上游是否变化」的信号，不是精确绑定
    const channel = await resolveInstallChannelConfig();
    return resolveVersion(
      toRepoUrl(dependencyRepo(spec)),
      dependencyMinVersion(spec),
      channel.githubMirror,
    ).version;
  }
  // github-copy 的版本是钉值本身，不是可比版本号；不需要写 lock
  return null;
}

/**
 * 获取一条依赖。失败不抛异常，由调用方按 `requiredness` 决定是否计入失败汇总。
 *
 * @param options 行为开关；缺省为 init 语义（见 `AcquireOptions`）
 */
export async function acquireDependency(
  spec: DependencySpec,
  ctx: AcquireContext,
  options: AcquireOptions = {},
): Promise<DependencyOutcome> {
  const installer = resolveInstallerId(spec);

  switch (installer) {
    case 'openspec': {
      const platforms = ctx.platforms.filter((p) => p.openspecToolId);
      const status = await installOpenSpec(
        ctx.projectPath,
        platforms,
        ctx.scope,
        true,
        options.upgradeInstalled ?? false,
      );
      return { status };
    }
    case 'codegraph': {
      const status = await installCodegraph(
        ctx.projectPath,
        ctx.scope,
        true,
        options.upgradeInstalled ?? false,
      );
      return { status };
    }
    case 'superpowers': {
      const result = await installSuperpowersForPlatforms(
        ctx.projectPath,
        ctx.scope,
        ctx.platforms.map((p) => p.id),
        true,
      );
      return { status: result.status };
    }
    case 'github-copy':
      return acquireGithubCopy(spec);
    case 'npm-cli':
      return acquireGenericNpmCli(spec, ctx);
  }
}
