/**
 * `polaris state next <change-name>` 核心逻辑：读 workflow 游标 + auto_transition，
 * 输出确定性的下一步衔接指令（对齐 assets/zh/policies/auto-transition.md）。
 *
 * 只读，不写盘、不持锁：
 *   - 未找到 entry → `NEXT: done`
 *   - 找到 entry 且 phase 可映射到下一 skill：
 *       auto_transition 开 → `NEXT: auto` + `SKILL`
 *       auto_transition 关 → `NEXT: manual` + `SKILL` + `HINT`
 *   - 找到 entry 但 phase 未知/终结 → `NEXT: done`
 */
import path from 'path';

import { loadPolarisConfig, type ProjectPolarisConfig } from '../config/polaris-project-config.js';
import { loadTaskState, type TaskState } from '../config/task-state.js';
import {
  loadWorkflowState,
  type WorkflowState,
  type WorkflowTaskEntry,
  type WorkflowTaskKind,
} from '../config/workflow-state.js';
import { fileExists } from '../../utils/file-system.js';
import { resolveRepoRoot } from './workflow-entry.js';

export type NextAction = 'auto' | 'manual' | 'done';

export type StateNextArgs = {
  /** 目标任务 id（change/requirement/testcase 通用） */
  changeName: string;
  repoRoot?: string;
  cwd?: string;
};

export type StateNextResult = {
  exitCode: number;
  next: NextAction;
  /** next != done 时的下一 skill 名（如 `polaris:coding:plan`） */
  skill?: string;
  /** next == manual 时的人工提示 */
  hint?: string;
  /** 命中 entry 的 phase（调试/透传用） */
  phase?: string;
  kind?: WorkflowTaskKind;
  message?: string;
};

/** kind → skill 族名 */
const FAMILY_BY_KIND: Record<WorkflowTaskKind, string> = {
  change: 'coding',
  requirement: 'prd',
  testcase: 'testing',
};

/**
 * phase → 下一 skill 名（仅含可自动衔接的目标）。
 * `delivery`/`archive` 为历史别名，映射到现行 `ship`。
 */
const PHASE_TO_SKILL: Record<string, Record<string, string>> = {
  coding: {
    plan: 'plan',
    design: 'design',
    tasks: 'tasks',
    build: 'build',
    verify: 'verify',
    ship: 'ship',
    delivery: 'ship',
    archive: 'ship',
  },
  prd: {
    draft: 'draft',
    refine: 'refine',
    ship: 'ship',
    delivery: 'ship',
  },
  testing: {},
};

/** 在三个任务列表中查找 task_id == 目标 id 的 entry */
export function findEntryByTaskId(
  state: WorkflowState,
  taskId: string,
): { kind: WorkflowTaskKind; entry: WorkflowTaskEntry } | null {
  const lists: Array<[WorkflowTaskKind, WorkflowTaskEntry[]]> = [
    ['change', state.change_tasks],
    ['requirement', state.requirement_tasks],
    ['testcase', state.testcase_tasks],
  ];
  for (const [kind, entries] of lists) {
    const hit = entries.find((e) => e.task_id === taskId);
    if (hit) {
      return { kind, entry: hit };
    }
  }
  return null;
}

/** 把 phase 映射为下一 skill 名；未知/终结 phase 返回 null */
export function resolveNextSkillName(kind: WorkflowTaskKind, phase: string): string | null {
  const family = FAMILY_BY_KIND[kind];
  const table = PHASE_TO_SKILL[family] ?? {};
  const normalized = (phase ?? '').trim();
  if (!normalized) {
    return null;
  }
  return table[normalized] ?? null;
}

/** 拼装完整 skill 名：`polaris<sep><family><sep><skill>` */
export function buildSkillName(separator: string, family: string, skill: string): string {
  return `polaris${separator}${family}${separator}${skill}`;
}

/**
 * 判定是否自动衔接。
 * 优先级：项目 config 的 `auto_transition`（`'auto'|'off'`，文档约定控制点）
 * → 任务 state 的 `auto_transition`（boolean）→ 默认自动。
 */
export function isAutoTransitionEnabled(
  config: ProjectPolarisConfig | null,
  taskState: TaskState | null,
): boolean {
  // 类型声明为 'auto'|'off'，但历史落盘值可能为 boolean true/false（见 formatPolarisConfigYaml）。
  const cfg = config?.auto_transition as unknown;
  if (cfg === 'off' || cfg === false) {
    return false;
  }
  if (taskState?.auto_transition === false) {
    return false;
  }
  return true;
}

/**
 * 解析技能名分隔符：nested → `:`；flat → `-`。
 * 依据插件根下是否存在族目录（`<plugin_root>/coding`）判断布局。
 */
export async function resolveSkillNameSeparator(repoRoot: string): Promise<string> {
  const config = await loadPolarisConfig(repoRoot);
  const raw = config?.plugin_root;
  if (!raw) {
    return ':';
  }
  const abs = path.isAbsolute(raw) ? raw : path.join(repoRoot, raw);
  const nested = await fileExists(path.join(abs, 'coding'));
  return nested ? ':' : '-';
}

/** 生成 stdout 输出行（供 CLI 打印，也便于单测断言） */
export function formatStateNextOutput(result: StateNextResult): string[] {
  if (result.next === 'done') {
    return ['NEXT: done'];
  }
  const lines = [`NEXT: ${result.next}`, `SKILL: ${result.skill ?? ''}`];
  if (result.next === 'manual') {
    lines.push(`HINT: ${result.hint ?? ''}`);
  }
  return lines;
}

/**
 * 执行 `state next`：读游标 → 映射 skill → 读 auto_transition → 输出。
 * 不 process.exit；通过 result.exitCode 返回退出码（0 成功 / 3 参数或环境错误）。
 */
export async function runStateNext(args: StateNextArgs): Promise<StateNextResult> {
  const taskId = (args.changeName ?? '').trim();
  if (!taskId) {
    return { exitCode: 3, next: 'done', message: '缺少 <change-name> 参数' };
  }

  const repoRoot = resolveRepoRoot(args.repoRoot, args.cwd);
  if (!repoRoot) {
    return { exitCode: 3, next: 'done', message: '无法解析主仓根' };
  }

  const state = await loadWorkflowState(repoRoot);
  const hit = findEntryByTaskId(state, taskId);
  if (!hit) {
    return { exitCode: 0, next: 'done' };
  }

  const skill = resolveNextSkillName(hit.kind, hit.entry.phase);
  if (!skill) {
    // phase 未知或已终结（如 ship 清游标后不应再命中），视为完成。
    return { exitCode: 0, next: 'done', phase: hit.entry.phase, kind: hit.kind };
  }

  const config = await loadPolarisConfig(repoRoot);
  const taskState = await loadTaskState(repoRoot, taskId);
  const auto = isAutoTransitionEnabled(config, taskState);

  const separator = await resolveSkillNameSeparator(repoRoot);
  const family = FAMILY_BY_KIND[hit.kind];
  const fullName = buildSkillName(separator, family, skill);

  if (auto) {
    return {
      exitCode: 0,
      next: 'auto',
      skill: fullName,
      phase: hit.entry.phase,
      kind: hit.kind,
    };
  }

  return {
    exitCode: 0,
    next: 'manual',
    skill: fullName,
    hint: `自动衔接已关闭，请手动运行 /${fullName}`,
    phase: hit.entry.phase,
    kind: hit.kind,
  };
}
