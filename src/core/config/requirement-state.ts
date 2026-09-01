/**
 * 需求任务运行态（`.polaris/tasks/<id>/state.yaml`）默认结构。
 * 对齐 assets/shared/templates/prd-state.example.yaml。
 */
import { writeFile } from 'fs/promises';
import path from 'path';
import { stringify as stringifyYaml } from 'yaml';

import { ensureDir } from '../../utils/file-system.js';

/** 阶段子块（discovery / draft / refine / ship 共用） */
export type RequirementPhaseBlock = {
  status?: string;
  started_at?: string;
  finished_at?: string;
};

/** ship 阶段额外字段 */
export type RequirementShipBlock = RequirementPhaseBlock & {
  harness_sync?: string;
  archive_dir?: string;
  archive?: string;
  archive_path?: string;
  archive_error?: string;
};

/** 需求任务 state.yaml 根结构 */
export interface RequirementState {
  language?: string;
  create_time?: string;
  main_repo_root?: string;
  task_id?: string;
  /** 任务类型，draft 扫描过滤用 */
  kind?: string;
  phase?: string;
  discovery?: RequirementPhaseBlock;
  draft?: RequirementPhaseBlock;
  refine?: RequirementPhaseBlock;
  ship?: RequirementShipBlock;
}

/** createDefaultRequirementState 可选覆盖 */
export type CreateDefaultRequirementStateOptions = {
  taskId?: string;
  language?: string;
  phase?: string;
};

/**
 * 生成对齐 prd-state.example 的默认需求任务状态。
 */
export function createDefaultRequirementState(
  options: CreateDefaultRequirementStateOptions = {},
): RequirementState {
  const taskId = options.taskId ?? '';
  const emptyPhase = (): RequirementPhaseBlock => ({
    status: '',
    started_at: '',
    finished_at: '',
  });
  return {
    language: options.language ?? 'zh',
    create_time: new Date().toISOString(),
    main_repo_root: '',
    task_id: taskId,
    kind: 'requirement',
    phase: options.phase ?? 'idle',
    discovery: emptyPhase(),
    draft: emptyPhase(),
    refine: emptyPhase(),
    ship: {
      ...emptyPhase(),
      harness_sync: '',
      archive_dir: '',
      archive: '',
      archive_path: '',
      archive_error: '',
    },
  };
}

/**
 * 将需求任务状态写入 YAML 文件。
 */
export async function saveRequirementStateToFile(
  statePath: string,
  state: RequirementState,
): Promise<void> {
  await ensureDir(path.dirname(statePath));
  await writeFile(statePath, stringifyYaml(state), 'utf-8');
}
