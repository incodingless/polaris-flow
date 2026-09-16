/**
 * 任务类型布局表：集中声明 coding / requirement / testcase / prototype 的存储根、
 * state 模板、初始化补丁与 bootstrap 文件。供 task-init / draft-create 使用。
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
  /** init 时在 task 目录内创建的文件（相对路径） */
  bootstrapFiles: TaskBootstrapFile[];
};

/** 四种任务类型的布局表 */
export const TASK_KIND_LAYOUTS: Record<WorkflowTaskKind, TaskKindLayout> = {
  coding: {
    kind: 'coding',
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
  },
  requirement: {
    kind: 'requirement',
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
  },
  testcase: {
    kind: 'testcase',
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
  },
  prototype: {
    kind: 'prototype',
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
