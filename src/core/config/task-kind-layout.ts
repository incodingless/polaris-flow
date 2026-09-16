/**
 * 任务类型布局表：集中声明 coding / requirement / testcase / prototype 的存储根、初始 phase 与 bootstrap 文件。
 * 供 task-init / draft-create 按 `--kind` 分支初始化。
 */
import { parseWorkflowTaskKind, type WorkflowTaskKind } from './workflow-state.js';
import type { TaskStorageSegment } from '../assets/polaris-paths.js';

/** init 时在任务目录内创建的相对文件 */
export type TaskBootstrapFile = {
  relPath: string;
  content: string;
};

/** 单种任务类型的目录与初始化约定 */
export type TaskKindLayout = {
  kind: WorkflowTaskKind;
  /** `.polaris` 下的一级目录名 */
  storageSegment: TaskStorageSegment;
  initialPhase: string;
  /** 选用哪套 state 工厂 */
  stateFactory: 'coding' | 'requirement' | 'testcase' | 'prototype';
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
    stateFactory: 'coding',
    usesDraft: true,
    bootstrapFiles: [],
  },
  requirement: {
    kind: 'requirement',
    storageSegment: 'tasks',
    initialPhase: 'discovery',
    stateFactory: 'requirement',
    usesDraft: false,
    bootstrapFiles: [],
  },
  testcase: {
    kind: 'testcase',
    storageSegment: 'testcases',
    initialPhase: 'discovery',
    stateFactory: 'testcase',
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
    stateFactory: 'prototype',
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
