/**
 * 上游最新版本探测：按登记表的 `method.kind` 分派「如何向上游问版本」。
 *
 * 定位：
 * - 只回答「上游现在是什么版本」。本地已装状态的判定在 `./probe.ts`，装的过程在
 *   `./install-dependency.ts`，三者不重叠。
 * - `polaris update` 用它和 `install-state.json` 里记录的已装版本做比较，决定是否重装。
 * - 探测与安装**必须共用同一份 `InstallChannelConfig`**：调用方先 `resolveInstallChannelConfig()`
 *   一次，再把结果同时交给本函数与安装器，否则「查到的版本」与「实际装到的版本」可能
 *   来自不同仓库（npm registry 与 GitHub 镜像各自可配）。
 * - `github-copy` 返回 null：附带技能的「更新」是重拉源再分发，其版本是钉值而非可比版本号，
 *   也不在 `trackedDependencyIds()` 里，正常不会出现在 update 的依赖清单中。
 */
import { getLatestNpmVersion } from './npm.js';
import { resolveVersion } from './github.js';
import {
  dependencyMinVersion,
  dependencyPackageName,
  dependencyRepo,
  toRepoUrl,
  type DependencySpec,
} from './registry.js';
import type { InstallChannelConfig } from '../install/channels.js';

/**
 * 探测某条依赖的上游最新版本。
 *
 * @param spec 登记表里的依赖声明；按其 `method.kind` 决定探测通道
 * @param channel 安装通道配置（npm registry / GitHub 镜像），须与后续安装使用同一份
 * @returns 可比版本号；探测失败、或该通道不参与版本比较时返回 null
 */
export async function resolveLatestVersion(
  spec: DependencySpec,
  channel: InstallChannelConfig,
): Promise<string | null> {
  switch (spec.method.kind) {
    case 'npm-cli':
      // registry 传 null 表示不加 --registry，走机器默认 ~/.npmrc
      return getLatestNpmVersion(dependencyPackageName(spec), channel.npmRegistry ?? null);
    case 'npx-skills':
      // npx 通道装的是仓库默认分支，tag 只作为「上游是否变化」的信号，不是精确版本绑定
      return resolveVersion(
        toRepoUrl(dependencyRepo(spec)),
        dependencyMinVersion(spec),
        channel.githubMirror,
      ).version;
    case 'github-copy':
      return null;
  }
}
