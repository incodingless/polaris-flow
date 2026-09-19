/**
 * 任务类型布局表：集中声明 coding / requirement / testcase / prototype / debug 的存储根、
 * state 模板、初始化补丁、bootstrap 文件，以及**阶段序列与各阶段产物**。
 * 供 task-init / draft-create / Dashboard 扫描层使用。
 *
 * `phases` 是「kind → 阶段」的单一真相：Dashboard 的步骤条、进度、分组全部由它派生，
 * 不再依赖任何 YAML 流程定义（旧 `config/tasks.yaml` 已随 polaris-cli 退役）。
 */
import { parseWorkflowTaskKind, type WorkflowTaskKind } from './workflow-state.js';
import type { TaskStorageSegment } from '../assets/polaris-paths.js';

/** init 时在任务目录内创建的相对文件 */
export type TaskBootstrapFile = {
  relPath: string;
  content: string;
};

/**
 * 初始化补丁：点路径 → 字面量或占位符。
 * 占位符：`$taskId` | `$now` | `$intentionRel` | `$planRel`
 */
export type TaskInitPatches = Record<string, string>;

/**
 * 阶段定义：`code` 即 `state.yaml` 的 `phase` 取值，是本表与 state 的接缝。
 *
 * 真相来源（2026-09-18 核对）：`assets/zh/skills/README.md` §阶段一览 与各 kind 的
 * `state.yaml` 模板注释；debug 族另参 `assets/zh/skills/debug/README.md`（2026-09-17 三阶段合并）。
 * 与之矛盾的 `workflow-template.yaml` 注释与 `2026-09-16-debug-workflow-design.md` 属陈旧文本，
 * 不作为实现依据。
 */
export type KindPhaseDef = {
  /** 阶段名，与 `state.yaml.phase` 一致 */
  code: string;
  /** 中文显示名 */
  name: string;
  /** 所属 UI 分组名（Dashboard 的步骤条按分组分段） */
  group: string;
  /**
   * 可选阶段（仅 coding 的 design：仅 full 模式走）。
   * UI 规则：当前 phase 已越过它时渲染为「已跳过」，而非「已完成」。
   */
  optional?: boolean;
  /**
   * 旁路阶段：可出现在 `state.yaml.phase`，但不属推进游标的主序列，
   * 不计入进度分母（仅 coding 的 retro）。
   */
  bypass?: boolean;
};

/** 产物定义 */
export type KindArtifactDef = {
  /** 该产物归属的阶段 code */
  phase: string;
  /**
   * 相对项目根的 posix 路径，可含 `<id>` 占位。
   * 多项为「任一存在即命中」，用于产物随阶段迁移的情形
   * （如 intention 先落 `.polaris/` 再迁 `openspec/`）。
   */
  relPaths: string[];
  kind: 'file' | 'dir';
  /** 是否逐项校验复选框（`tasks.md`） */
  checkboxes?: boolean;
};

/** 单种任务类型的目录与初始化约定 */
export type TaskKindLayout = {
  kind: WorkflowTaskKind;
  /** `.polaris` 下的一级目录名 */
  storageSegment: TaskStorageSegment;
  initialPhase: string;
  /** `assets/shared/templates/` 下的 state 模板文件名 */
  stateTemplate: string;
  /** 复制模板后写入的初始化覆盖 */
  initPatches: TaskInitPatches;
  /**
   * 是否走 draft-* 临时目录。
   * false 时须传正式 task_id，直接初始化 `.polaris/<segment>/<task_id>/`。
   */
  usesDraft: boolean;
  /** init 时在任务目录内创建的文件（相对路径） */
  bootstrapFiles: TaskBootstrapFile[];
  /** 阶段序列（含旁路；旁路用 `bypass` 标记） */
  phases: KindPhaseDef[];
  /** 面向界面的中文类型名（单一真相，前端不再自持一份） */
  label: string;
  /** 各阶段产物（**只登记已核实的路径**，不确定的不写） */
  artifacts: KindArtifactDef[];
};

/** 五种任务类型的布局表 */
export const TASK_KIND_LAYOUTS: Record<WorkflowTaskKind, TaskKindLayout> = {
  coding: {
    kind: 'coding',
    label: '开发',
    storageSegment: 'tasks',
    initialPhase: 'specify',
    stateTemplate: 'state.example.yaml',
    initPatches: {
      kind: 'coding',
      change_id: '$taskId',
      task_id: '$taskId',
      phase: 'specify',
      'runtime.specify.intention_path': '$intentionRel',
      'runtime.specify.status': 'in_progress',
      'runtime.specify.start_time': '$now',
    },
    usesDraft: true,
    bootstrapFiles: [],
    phases: [
      { code: 'specify', name: '澄清', group: '澄清与方案' },
      { code: 'plan', name: '提案', group: '澄清与方案' },
      { code: 'design', name: '深度设计', group: '澄清与方案', optional: true },
      { code: 'tasks', name: '任务规划', group: '实现' },
      { code: 'build', name: '构建', group: '实现' },
      { code: 'verify', name: '验收', group: '收口' },
      { code: 'ship', name: '交付', group: '收口' },
      { code: 'retro', name: '复盘', group: '旁路', bypass: true },
    ],
    artifacts: [
      {
        phase: 'specify',
        relPaths: ['.polaris/tasks/<id>/intention.md', 'openspec/changes/<id>/intention.md'],
        kind: 'file',
      },
      { phase: 'plan', relPaths: ['openspec/changes/<id>/proposal.md'], kind: 'file' },
      { phase: 'plan', relPaths: ['openspec/changes/<id>/design.md'], kind: 'file' },
      { phase: 'plan', relPaths: ['openspec/changes/<id>/specs'], kind: 'dir' },
      { phase: 'design', relPaths: ['openspec/changes/<id>/detailed-design.md'], kind: 'file' },
      {
        phase: 'tasks',
        relPaths: ['openspec/changes/<id>/tasks.md'],
        kind: 'file',
        checkboxes: true,
      },
      {
        phase: 'verify',
        relPaths: ['openspec/changes/<id>/reviews/verify-report.md'],
        kind: 'file',
      },
      { phase: 'ship', relPaths: ['.polaris/archive/<id>'], kind: 'dir' },
    ],
  },
  requirement: {
    kind: 'requirement',
    label: '需求',
    storageSegment: 'tasks',
    initialPhase: 'discovery',
    stateTemplate: 'prd-state.example.yaml',
    initPatches: {
      task_id: '$taskId',
      phase: 'discovery',
      'discovery.status': 'in_progress',
      'discovery.started_at': '$now',
    },
    usesDraft: false,
    bootstrapFiles: [],
    phases: [
      { code: 'discovery', name: '澄清', group: '澄清与草稿' },
      { code: 'draft', name: '草稿', group: '澄清与草稿' },
      { code: 'refine', name: '完善', group: '完善与交付' },
      { code: 'ship', name: '交付', group: '完善与交付' },
    ],
    // 依据 `assets/zh/skills/prd/README.md` §产物布局
    artifacts: [
      { phase: 'discovery', relPaths: ['.polaris/tasks/<id>/req_baseline.md'], kind: 'file' },
      {
        phase: 'discovery',
        relPaths: ['.polaris/tasks/<id>/req_clarify_summary.md'],
        kind: 'file',
      },
      { phase: 'draft', relPaths: ['.polaris/tasks/<id>/prd-draft.md'], kind: 'file' },
      { phase: 'draft', relPaths: ['.polaris/tasks/<id>/_baseline_index.json'], kind: 'file' },
      { phase: 'draft', relPaths: ['.polaris/tasks/<id>/_key_points.json'], kind: 'file' },
      { phase: 'refine', relPaths: ['.polaris/tasks/<id>/prd-final-v1.0.md'], kind: 'file' },
      // ship 迁移到 $PRD_DOC_DIR，默认 $REPO_ROOT/docs/prd/
      { phase: 'ship', relPaths: ['docs/prd'], kind: 'dir' },
    ],
  },
  testcase: {
    kind: 'testcase',
    label: '测试用例',
    storageSegment: 'testcases',
    initialPhase: 'discovery',
    stateTemplate: 'testcase-state.example.yaml',
    initPatches: {
      task_id: '$taskId',
      phase: 'discovery',
      plan_path: '$planRel',
      'discovery.status': 'in_progress',
      'discovery.started_at': '$now',
    },
    usesDraft: true,
    bootstrapFiles: [
      {
        relPath: 'testcase_plan.md',
        content: '# testcase plan: <TBD>\n\n<!-- Skill 填充正文 -->\n',
      },
    ],
    phases: [
      { code: 'discovery', name: '澄清', group: '澄清与草稿' },
      { code: 'draft', name: '草稿', group: '澄清与草稿' },
      { code: 'refine', name: '完善', group: '完善与交付' },
      { code: 'ship', name: '交付', group: '完善与交付' },
    ],
    // 只登记已核实项：testing/ 族的 SKILL.md 目前不含任何路径引用，
    // 其余产物待该族落地后按实测补，不猜。
    artifacts: [
      { phase: 'draft', relPaths: ['.polaris/testcases/<id>/testcase_plan.md'], kind: 'file' },
    ],
  },
  prototype: {
    kind: 'prototype',
    label: '原型',
    storageSegment: 'tasks',
    initialPhase: 'blueprint',
    stateTemplate: 'prototype-state.example.yaml',
    initPatches: {
      task_id: '$taskId',
      phase: 'blueprint',
      'blueprint.status': 'in_progress',
      'blueprint.started_at': '$now',
    },
    usesDraft: false,
    bootstrapFiles: [],
    phases: [
      { code: 'blueprint', name: '原型蓝图', group: '蓝图' },
      { code: 'build', name: '原型构建', group: '构建与评审' },
      { code: 'review', name: '原型评审', group: '构建与评审' },
      { code: 'ship', name: '交付', group: '交付' },
    ],
    // build/review 的产物是原型 HTML，文件名由 blueprint 决定、无固定名，故不登记。
    artifacts: [
      { phase: 'blueprint', relPaths: ['.polaris/tasks/<id>/blueprint.md'], kind: 'file' },
      { phase: 'blueprint', relPaths: ['.polaris/tasks/<id>/task-card.md'], kind: 'file' },
      { phase: 'ship', relPaths: ['docs/prototype'], kind: 'dir' },
    ],
  },
  debug: {
    kind: 'debug',
    label: '缺陷修复',
    storageSegment: 'tasks',
    // 三阶段：diagnose → patch → closeout（2026-09-17 合并）。
    // 原 triage 起始阶段与 runtime.triage.* 属六段时代遗留，已一并改正，否则新建
    // 的 debug 任务会写成 phase: triage、在面板上显示「未知阶段」。
    initialPhase: 'diagnose',
    stateTemplate: 'debug-state.example.yaml',
    initPatches: {
      task_id: '$taskId',
      phase: 'diagnose',
      'runtime.diagnose.status': 'in_progress',
      'runtime.diagnose.started_at': '$now',
    },
    usesDraft: false,
    bootstrapFiles: [],
    phases: [
      { code: 'diagnose', name: '诊断与方案', group: '诊断' },
      { code: 'patch', name: '实现与自验', group: '修复与关单' },
      { code: 'closeout', name: '关闭 Bug', group: '修复与关单' },
    ],
    // 依据 `assets/zh/skills/debug/closeout/references/artifacts.md`（debug 族产物契约）。
    // 注意：debug 归档落 docs/troubleshooting/<id>/，**不用** .polaris/archive/。
    artifacts: [
      { phase: 'diagnose', relPaths: ['.polaris/tasks/<id>/diagnose-brief.md'], kind: 'file' },
      { phase: 'diagnose', relPaths: ['.polaris/tasks/<id>/reviews/rca-report.md'], kind: 'file' },
      {
        phase: 'diagnose',
        relPaths: ['.polaris/tasks/<id>/tasks.md'],
        kind: 'file',
        checkboxes: true,
      },
      { phase: 'patch', relPaths: ['.polaris/tasks/<id>/verification.md'], kind: 'file' },
      {
        phase: 'closeout',
        relPaths: ['.polaris/tasks/<id>/reviews/bugfix-report.md'],
        kind: 'file',
      },
      { phase: 'closeout', relPaths: ['docs/troubleshooting/<id>'], kind: 'dir' },
    ],
  },
};

/** 取 kind 对应布局；非法 kind 由调用方先 parse */
export function getTaskKindLayout(kind: WorkflowTaskKind): TaskKindLayout {
  return TASK_KIND_LAYOUTS[kind];
}

/** 解析并校验 kind；非法则返回 null（与 workflow-state 同源） */
export function parseTaskKind(raw: string | undefined): WorkflowTaskKind | null {
  return parseWorkflowTaskKind(raw);
}

/**
 * 取 kind 的阶段序列。
 * 默认排除旁路阶段（coding 的 retro）——旁路可出现在 state 里，但不推进游标、不计入进度。
 */
export function getKindPhases(
  kind: WorkflowTaskKind,
  options: { includeBypass?: boolean } = {},
): KindPhaseDef[] {
  const { includeBypass = false } = options;
  return TASK_KIND_LAYOUTS[kind].phases.filter((p) => includeBypass || !p.bypass);
}

/** 取 kind 的 UI 分组名序列（按首次出现顺序，只含主序列的组） */
export function getKindGroups(kind: WorkflowTaskKind): string[] {
  const groups: string[] = [];
  for (const phase of getKindPhases(kind)) {
    if (!groups.includes(phase.group)) {
      groups.push(phase.group);
    }
  }
  return groups;
}

/** phase 所属分组；未登记返回 null（调用方据此走「未知阶段」兜底） */
export function phaseGroupOf(kind: WorkflowTaskKind, phase: string): string | null {
  const found = TASK_KIND_LAYOUTS[kind].phases.find((p) => p.code === phase);
  return found ? found.group : null;
}

/** phase 在主序列中的序号（从 0）；未登记或为旁路阶段返回 -1 */
export function phaseIndexIn(kind: WorkflowTaskKind, phase: string): number {
  return getKindPhases(kind).findIndex((p) => p.code === phase);
}

/**
 * phase 是否为该 kind 的合法取值（**含旁路**）。
 * 用于「未知值不崩」的兜底判定：为 false 时调用方显示原值并标注，不抛错。
 */
export function isKnownPhase(kind: WorkflowTaskKind, phase: string): boolean {
  return TASK_KIND_LAYOUTS[kind].phases.some((p) => p.code === phase);
}

/** 取 kind 的界面显示名（单一真相；前端不再自持一份类型名表） */
export function getKindLabel(kind: WorkflowTaskKind): string {
  return TASK_KIND_LAYOUTS[kind].label;
}

/** 取 kind 的产物定义；传 phase 则只取该阶段的 */
export function getKindArtifacts(kind: WorkflowTaskKind, phase?: string): KindArtifactDef[] {
  const all = TASK_KIND_LAYOUTS[kind].artifacts;
  return phase === undefined ? [...all] : all.filter((a) => a.phase === phase);
}
