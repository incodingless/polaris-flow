/**
 * `polaris task-state-entry` 命令：任务 state.yaml 读写。
 */
import {
  runTaskStateEntry,
  type BlockStyle,
  type TaskStateEntryOp,
} from '../../core/hooks/task-state-entry.js';

export type TaskStateEntryCommandOptions = {
  repoRoot?: string;
  taskId?: string;
  statePath?: string;
  kind?: string;
  path?: string[];
  paths?: string;
  set?: string[];
  phase?: string;
  nextPhase?: string;
  blockStyle?: string;
  skill?: string;
  reqName?: string;
  reqNameCn?: string;
  reqPrefix?: string;
  name?: string;
  pagePrefix?: string;
  workDir?: string;
  deliveredName?: string;
  file?: string;
  index?: string;
  checked?: string;
  /** 跳过 phase 写入校验（一次性修正存量数据）；会写入 .polaris/overrides.log */
  forcePhase?: boolean;
};

/**
 * 运行 task-state-entry；按契约设置 process.exitCode。
 */
export async function taskStateEntryCommand(
  op: string,
  options: TaskStateEntryCommandOptions,
): Promise<void> {
  const blockStyle =
    options.blockStyle === 'runtime' || options.blockStyle === 'top-level'
      ? (options.blockStyle as BlockStyle)
      : options.blockStyle === 'auto'
        ? 'auto'
        : undefined;

  const result = await runTaskStateEntry({
    op: op as TaskStateEntryOp,
    repoRoot: options.repoRoot,
    taskId: options.taskId,
    statePath: options.statePath,
    kind: options.kind,
    paths: options.path,
    pathsCsv: options.paths,
    sets: options.set,
    phase: options.phase,
    nextPhase: options.nextPhase,
    blockStyle,
    skill: options.skill,
    reqName: options.reqName,
    reqNameCn: options.reqNameCn,
    reqPrefix: options.reqPrefix,
    name: options.name,
    pagePrefix: options.pagePrefix,
    workDir: options.workDir,
    deliveredName: options.deliveredName,
    file: options.file,
    // --index / --checked 从 CLI 来是字符串：这里转成类型化的入参，
    // 非法值留给 core 层报「必须是非负整数 / true|false」，不在此处静默兜底成 0。
    index: options.index === undefined ? undefined : Number(options.index),
    checked: options.checked === 'true' ? true : options.checked === 'false' ? false : undefined,
    forcePhase: options.forcePhase,
  });

  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}
