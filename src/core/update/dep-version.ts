/**
 * 第三方依赖（openspec / superpowers / codegraph）的更新判定（纯函数，无 I/O）。
 *
 * 「已装版本」以 `.polaris/skills-lock.json` 的 `sources[].version` 为唯一事实来源，
 * 记录的是上次安装时解析到的上游版本，而不是 `npm list -g` 的现场探测结果：
 * 全局 npm prefix 不可写时伴生 CLI 会装到 `~/.polaris/cli`，现场探测查不到会返回
 * `0.0.0`，把「已装」误判成「未装」。
 *
 * 上游版本探测不到时不视为「有更新」：无法确认有新版本却照常重装，既不会带来版本变化，
 * 又会重写项目内的 openspec / codegraph 配置，因此跳过并让调用方给出可行动提示。
 *
 * superpowers 的 npx 通道实际拉取的是仓库默认分支，写入的 tag 仅作为「上游是否变化」的
 * 信号，不代表精确绑定该 tag；判定只依赖这个信号是否比上次记录的 tag 更新。
 */
import { compareVersions } from '../deps/version.js';

/** 单个依赖的更新决策 */
export type DepUpdateAction =
  | { kind: 'skip'; reason: 'up-to-date' | 'unreachable'; version: string | null }
  | { kind: 'install'; version: string | null };

/** 版本字符串可作 semver 比较（去掉 `v` 前缀、形如 x.y.z…；`local`/`HEAD`/`npx-latest` 均不可比） */
export function isConcreteVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+/.test(version.trim().replace(/^v/, ''));
}

/**
 * 依据 lock 中已装版本、上游最新版本与强制标记决定是否重装。
 *
 * 判定顺序：
 * - `--force` 一律安装，但仍把探测到的上游版本带回，供安装成功后回写 lock；
 * - 上游缺失或不可比 → 跳过并标记 unreachable（无法确认变化，不静默重装）；
 * - 已装版本可比且上游不新于已装 → 跳过并标记 up-to-date；
 * - 其余（已装缺失 / 不可比，或上游更新）→ 安装，用本次安装建立可比基线。
 *
 * @param installed lock 中记录的已装版本；缺失或占位符时传 null
 * @param latest 上游最新版本；探测失败传 null
 * @param force 是否强制重装
 */
export function resolveDepUpdateAction(
  installed: string | null,
  latest: string | null,
  force: boolean,
): DepUpdateAction {
  if (force) {
    return { kind: 'install', version: latest };
  }

  if (latest === null || !isConcreteVersion(latest)) {
    return { kind: 'skip', reason: 'unreachable', version: installed };
  }

  if (
    installed !== null &&
    isConcreteVersion(installed) &&
    compareVersions(latest, installed) <= 0
  ) {
    return { kind: 'skip', reason: 'up-to-date', version: installed };
  }

  return { kind: 'install', version: latest };
}
