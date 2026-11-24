/**
 * update 的目标范围解析：把 `--only` / `--skip` 的字符串项展开为三层执行清单。
 *
 * 可选值共 6 项：
 * - `framework`：程序本体 + Polaris 资产（skills/commands/agents/rules/hooks 五类一起更）——**也是默认范围**
 * - `deps`   ：第三方依赖（openspec / superpowers / codegraph）——默认不更新，需显式指定
 * - `all`    ：framework + deps
 * - `openspec` / `superpowers` / `codegraph`：单个依赖
 *
 * 资产五类不再单独可选：技能与命令由同一份清单一起生成、一起过期，按类别挑着更的
 * 场景不成立，保留只会让词表膨胀；要细粒度重写用 `--force` 配合指纹门控。
 *
 * 未知项直接抛错，不静默忽略 —— 静默忽略会让用户以为已经更新了某个范围。
 */
import { POLARIS_ASSET_KINDS, type PolarisAssetKind } from '../install/types.js';
import { trackedDependencyIds } from '../deps/registry.js';

/** 可独立更新的第三方依赖 */
export type UpdateDependency = string;

/** 全部第三方依赖（顺序与依赖登记表一致） */
export const UPDATE_DEPENDENCIES: readonly UpdateDependency[] = trackedDependencyIds();

/** 展开后的更新计划 */
export type UpdatePlan = {
  program: boolean;
  /** 需要执行的资产类别，顺序与安装顺序一致 */
  assets: PolarisAssetKind[];
  deps: UpdateDependency[];
};

/** `--only` / `--skip` 的合法取值（用于报错提示与 --help） */
export const UPDATE_TARGETS: readonly string[] = [
  'framework',
  'deps',
  'all',
  ...UPDATE_DEPENDENCIES,
];

/** 归一：去空白、转小写、去重、丢空串 */
function normalizeItems(list: string[] | undefined): string[] {
  const seen = new Set<string>();
  for (const raw of list ?? []) {
    const item = raw.trim().toLowerCase();
    if (item) seen.add(item);
  }
  return [...seen];
}

/** 把已识别的成员并入计划（保持安装顺序，不重复） */
function addAssets(plan: UpdatePlan, kinds: readonly PolarisAssetKind[]): void {
  for (const kind of kinds) {
    if (!plan.assets.includes(kind)) plan.assets.push(kind);
  }
}

function addDeps(plan: UpdatePlan, deps: readonly UpdateDependency[]): void {
  for (const dep of deps) {
    if (!plan.deps.includes(dep)) plan.deps.push(dep);
  }
}

function sortByCanonicalOrder(plan: UpdatePlan): UpdatePlan {
  return {
    program: plan.program,
    assets: POLARIS_ASSET_KINDS.filter((kind) => plan.assets.includes(kind)),
    deps: UPDATE_DEPENDENCIES.filter((dep) => plan.deps.includes(dep)),
  };
}

/** 展开单项；未知项抛错 */
function expandItem(plan: UpdatePlan, item: string): void {
  switch (item) {
    case 'framework':
      plan.program = true;
      addAssets(plan, POLARIS_ASSET_KINDS);
      return;
    case 'deps':
      addDeps(plan, UPDATE_DEPENDENCIES);
      return;
    case 'all':
      expandItem(plan, 'framework');
      expandItem(plan, 'deps');
      return;
    default:
      // 依赖成员名由登记表决定，新增依赖自动可被 --only / --skip 命中
      if (UPDATE_DEPENDENCIES.includes(item)) {
        addDeps(plan, [item]);
        return;
      }
      throw new Error(`未知的更新项 "${item}"，可选值：${UPDATE_TARGETS.join(', ')}`);
  }
}

/** 展开一组项为计划 */
function expandItems(items: string[]): UpdatePlan {
  const plan: UpdatePlan = { program: false, assets: [], deps: [] };
  for (const item of items) {
    expandItem(plan, item);
  }
  return sortByCanonicalOrder(plan);
}

/** 计划是否为空（无任何待更新项） */
export function isEmptyUpdatePlan(plan: UpdatePlan): boolean {
  return !plan.program && plan.assets.length === 0 && plan.deps.length === 0;
}

/**
 * 解析更新范围。
 * - 都不传 → 默认范围 `framework`（程序本体 + 资产；依赖不自动更新，联网升级需显式指定）
 * - 只传 `--only` → 只更新列出的项
 * - 只传 `--skip` → 全量减去列出的项
 * - 同时传 → 抛错（语义冲突，拒绝猜测用户意图）
 */
export function resolveUpdatePlan(only?: string[], skip?: string[]): UpdatePlan {
  const onlyItems = normalizeItems(only);
  const skipItems = normalizeItems(skip);

  if (onlyItems.length > 0 && skipItems.length > 0) {
    throw new Error('--only 与 --skip 不能同时使用，请只保留其中一个');
  }

  let plan: UpdatePlan;
  if (onlyItems.length > 0) {
    plan = expandItems(onlyItems);
  } else if (skipItems.length > 0) {
    const full = expandItems(['all']);
    const removed = expandItems(skipItems);
    plan = {
      program: full.program && !removed.program,
      assets: full.assets.filter((kind) => !removed.assets.includes(kind)),
      deps: full.deps.filter((dep) => !removed.deps.includes(dep)),
    };
  } else {
    plan = expandItems(['framework']);
  }

  if (isEmptyUpdatePlan(plan)) {
    throw new Error('更新范围为空：--only / --skip 组合后没有任何待更新项');
  }

  return plan;
}
