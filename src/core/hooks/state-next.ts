/**
 * `polaris-flow state next <change-name>` 核心逻辑：读 workflow 游标 + auto_transition，
 * 输出确定性的下一步衔接指令（对齐 assets/zh/policies/auto-transition.md）。
 *
 * **阶段 → 技能**的映射**不在这里**，而在 `src/core/config/task-kind-layout.ts` 的阶段表上
 * （`skillForPhase`）。本模块只做三件事：读游标、判定是否自动衔接、拼完整技能名。
 *
 * 这里曾经有两张手写的转移表（`PHASE_TO_SKILL` / `DEBUG_PHASE_TO_SKILL`），其中
 * **prototype 与 debug 两张偏移了一位**——按"游标 = 待执行阶段"的约定，游标为 `build`
 * 时返回 `ship`、为 `diagnose` 时返回 `patch`，会让自动衔接**逐段跳阶段且不报错**；
 * `closeout` 更是直接返回 null（`NEXT: done`，跳过关单）。2026-09-19 删除，
 * 见 `docs/specs/2026-09-19-phase-truth-unification-design.md` 的 D13。
 *
 * 只读，不写盘、不持锁：
 *   - 未找到 entry → `NEXT: done`
 *   - 找到 entry 且 phase 可映射到下一 skill：
 *       auto_transition 开 → `NEXT: auto` + `SKILL`
 *       auto_transition 关 → `NEXT: manual` + `SKILL` + `HINT`
 *   - 找到 entry 但 phase 无衔接（入口/旁路/未登记）→ `NEXT: done`
 */
import path from 'path';

import { skillForPhase } from '../config/task-kind-layout.js';
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
  /** 目标任务 id（coding/requirement/testcase/prototype 通用） */
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
  coding: 'coding',
  requirement: 'prd',
  testcase: 'testing',
  prototype: 'prototype',
  debug: 'debug',
};

/** 在五个任务列表中查找 task_id == 目标 id 的 entry */
export function findEntryByTaskId(
  state: WorkflowState,
  taskId: string,
): { kind: WorkflowTaskKind; entry: WorkflowTaskEntry } | null {
  const lists: Array<[WorkflowTaskKind, WorkflowTaskEntry[]]> = [
    ['coding', state.coding_tasks],
    ['requirement', state.requirement_tasks],
    ['testcase', state.testcase_tasks],
    ['prototype', state.prototype_tasks],
    ['debug', state.debug_tasks],
  ];
  for (const [kind, entries] of lists) {
    const hit = entries.find((e) => e.task_id === taskId);
    if (hit) {
      return { kind, entry: hit };
    }
  }
  return null;
}

/** 拼装完整 skill 名：`polaris<sep><family><sep><skill>` */
export function buildSkillName(separator: string, family: string, skill: string): string {
  return `polaris${separator}${family}${separator}${skill}`;
}

/**
 * 判定是否自动衔接。
 * 优先级：项目 config 的 `auto_transition`（`'auto'|'off'`，文档约定控制点）
 * → 任务 state 的 `auto_transition`（boolean）→ **默认 manual**。
 *
 * 2026-09-22 起出厂默认改为 manual（`false`）：每完成一个技能停下并提示用户新开会话，
 * 而不是在同一会话连跑。需要连续执行的用户显式设 `auto_transition: auto`。
 *
 * 配置联动（2026-09-23）：`auto_transition: 'auto'` 蕴含 `context_compression ≠ off`
 * —— 「不能压缩却要自动跑」是非法组合，此处直接降级为 manual。
 */
export function isAutoTransitionEnabled(
  config: ProjectPolarisConfig | null,
  taskState: TaskState | null,
): boolean {
  // 类型声明为 'auto'|'off'，但历史落盘值可能为 boolean true/false（见 formatPolarisConfigYaml）。
  const cfg = config?.auto_transition as unknown;

  // 显式关闭优先：config 或任务级任一为 false/off 即 manual
  if (cfg === 'off' || cfg === false) {
    return false;
  }
  if (taskState?.auto_transition === false) {
    return false;
  }

  // 开启来源：config 'auto' 或任务级 true；两者都未声明 → 出厂 manual
  const wantsAuto = cfg === 'auto' || taskState?.auto_transition === true;
  if (!wantsAuto) {
    return false;
  }

  // 配置联动（2026-09-23）：auto 蕴含 context_compression ≠ off。
  // 「不能压缩却要自动跑」是非法组合（违背「每技能新开会话」原则），降级为 manual。
  if (config?.context_compression === 'off') {
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

  const skill = skillForPhase(hit.kind, hit.entry.phase);
  if (!skill) {
    // 入口阶段 / 旁路阶段 / 未登记值 → 无自动衔接，视为完成。
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
    hint: `请新开会话并执行 /${fullName}（当前为手动衔接模式）`,
    phase: hit.entry.phase,
    kind: hit.kind,
  };
}
