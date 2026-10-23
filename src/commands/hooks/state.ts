/**
 * `polaris-flow state next <change-name>` 命令：阶段守卫推进后的自动衔接。
 * 读 workflow 游标 phase + auto_transition，stdout 输出 `NEXT: auto|manual|done`。
 */
import { formatStateNextOutput, runStateNext } from '../../core/hooks/state-next.js';

export type StateNextCommandOptions = {
  repoRoot?: string;
};

/**
 * 运行 `state next`；按契约设置 process.exitCode。
 */
export async function stateNextCommand(
  changeName: string,
  options: StateNextCommandOptions,
): Promise<void> {
  const result = await runStateNext({
    changeName,
    repoRoot: options.repoRoot,
  });

  if (result.exitCode === 3) {
    console.error(`[state-next] 阻断：${result.message ?? '未知错误'}`);
    process.exitCode = 3;
    return;
  }

  for (const line of formatStateNextOutput(result)) {
    console.log(line);
  }
}
