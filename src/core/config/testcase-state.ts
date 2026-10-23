/**
 * 测试用例任务运行态（`.polaris/testcases/<id>/state.yaml`）默认结构。
 * 对齐 assets/shared/templates/testcase-state.example.yaml。
 */
import { writeFile } from 'fs/promises';
import path from 'path';
import { stringify as stringifyYaml } from 'yaml';

import { ensureDir } from '../../utils/file-system.js';

/** 阶段子块（discovery / draft / refine / ship 共用） */
export type TestcasePhaseBlock = {
  status?: string;
  started_at?: string;
  finished_at?: string;
};

/** ship 阶段额外字段 */
export type TestcaseShipBlock = TestcasePhaseBlock & {
  harness_sync?: string;
  archive_dir?: string;
  archive?: string;
  archive_path?: string;
  archive_error?: string;
};

/** 测试用例任务 state.yaml 根结构 */
export interface TestcaseState {
  language?: string;
  create_time?: string;
  main_repo_root?: string;
  task_id?: string;
  /** 任务类型，draft 扫描过滤用 */
  kind?: string;
  phase?: string;
  /** 计划文档相对路径 */
  plan_path?: string;
  discovery?: TestcasePhaseBlock;
  draft?: TestcasePhaseBlock;
  refine?: TestcasePhaseBlock;
  ship?: TestcaseShipBlock;
}

/** createDefaultTestcaseState 可选覆盖 */
export type CreateDefaultTestcaseStateOptions = {
  taskId?: string;
  language?: string;
  phase?: string;
  planPath?: string;
};

/**
 * 生成对齐 testcase-state.example 的默认测试用例任务状态。
 */
export function createDefaultTestcaseState(
  options: CreateDefaultTestcaseStateOptions = {},
): TestcaseState {
  const taskId = options.taskId ?? '';
  const emptyPhase = (): TestcasePhaseBlock => ({
    status: '',
    started_at: '',
    finished_at: '',
  });
  return {
    language: options.language ?? 'zh',
    create_time: new Date().toISOString(),
    main_repo_root: '',
    task_id: taskId,
    kind: 'testcase',
    phase: options.phase ?? 'idle',
    plan_path: options.planPath ?? '',
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
 * 将测试用例任务状态写入 YAML 文件。
 */
export async function saveTestcaseStateToFile(
  statePath: string,
  state: TestcaseState,
): Promise<void> {
  await ensureDir(path.dirname(statePath));
  await writeFile(statePath, stringifyYaml(state), 'utf-8');
}
