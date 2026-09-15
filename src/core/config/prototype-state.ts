/**
 * 原型任务运行态（`.polaris/tasks/<id>/state.yaml`）默认结构。
 * 对齐 assets/shared/templates/prototype-state.example.yaml。
 */
import { writeFile } from 'fs/promises';
import path from 'path';
import { stringify as stringifyYaml } from 'yaml';

import { ensureDir } from '../../utils/file-system.js';

/** 阶段子块（blueprint / build / review / ship 共用） */
export type PrototypePhaseBlock = {
  status?: string;
  started_at?: string;
  finished_at?: string;
};

/** build.gate 前置校验子块 */
export type PrototypeBuildGate = {
  passed?: boolean;
  checked_at?: string;
  baseline_id?: string;
  clarify_summary_id?: string | null;
  complexity?: string;
  fail_reason?: string;
  boundary?: string;
};

/** build 阶段额外字段 */
export type PrototypeBuildBlock = PrototypePhaseBlock & {
  gate?: PrototypeBuildGate;
};

/** ship 阶段额外字段 */
export type PrototypeShipBlock = PrototypePhaseBlock & {
  harness_sync?: string;
  archive_dir?: string;
  archive?: string;
  archive_error?: string;
};

/** 原型任务 state.yaml 根结构 */
export interface PrototypeState {
  language?: string;
  create_time?: string;
  task_id?: string;
  /** 任务类型，draft 扫描过滤用 */
  kind?: string;
  name?: string;
  page_prefix?: string;
  work_dir?: string;
  phase?: string;
  blueprint?: PrototypePhaseBlock;
  build?: PrototypeBuildBlock;
  review?: PrototypePhaseBlock;
  ship?: PrototypeShipBlock;
}

/** createDefaultPrototypeState 可选覆盖 */
export type CreateDefaultPrototypeStateOptions = {
  taskId?: string;
  language?: string;
  phase?: string;
  name?: string;
  pagePrefix?: string;
  workDir?: string;
};

/**
 * 生成对齐 prototype-state.example 的默认原型任务状态。
 */
export function createDefaultPrototypeState(
  options: CreateDefaultPrototypeStateOptions = {},
): PrototypeState {
  const taskId = options.taskId ?? '';
  const emptyPhase = (): PrototypePhaseBlock => ({
    status: '',
    started_at: '',
    finished_at: '',
  });
  return {
    language: options.language ?? 'zh',
    create_time: new Date().toISOString(),
    task_id: taskId,
    kind: 'prototype',
    name: options.name ?? '',
    page_prefix: options.pagePrefix ?? '',
    work_dir: options.workDir ?? '',
    phase: options.phase ?? 'idle',
    blueprint: emptyPhase(),
    build: {
      ...emptyPhase(),
      gate: {
        passed: true,
        checked_at: '',
        baseline_id: '',
        clarify_summary_id: null,
        complexity: '',
        fail_reason: '',
        boundary: '',
      },
    },
    review: emptyPhase(),
    ship: {
      ...emptyPhase(),
      harness_sync: '',
      archive_dir: '',
      archive: '',
      archive_error: '',
    },
  };
}

/**
 * 将原型任务状态写入 YAML 文件。
 */
export async function savePrototypeStateToFile(
  statePath: string,
  state: PrototypeState,
): Promise<void> {
  await ensureDir(path.dirname(statePath));
  await writeFile(statePath, stringifyYaml(state), 'utf-8');
}
