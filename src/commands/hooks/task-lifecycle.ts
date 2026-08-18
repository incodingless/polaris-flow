/**
 * `polaris task-init` 命令。
 */
import { finalize, init } from '../../core/hooks/task.js';

/** 运行 task-init */
export async function taskInitCommand(repoRoot: string): Promise<void> {
    const result = await init(repoRoot);
    if (result.payload) {
        console.log(JSON.stringify(result.payload));
    }
    if (result.message) {
        console.error(`[task-init] 阻断：${result.message}`);
    }
    process.exitCode = result.exitCode;
}

/** 运行 task-finalize */
export async function taskFinalizeCommand(
    repoRoot: string, draftName: string, changeId: string): Promise<void> {
    const result = await finalize(repoRoot, draftName, changeId);
    if (result.payload) {
        console.log(JSON.stringify(result.payload));
    }
    if (result.message) {
        console.error(`[task-finalize] 阻断：${result.message}`);
    }
    process.exitCode = result.exitCode;
}