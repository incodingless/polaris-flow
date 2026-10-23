/**
 * `polaris draft-create` 命令。
 */
import { runDraftCreate } from '../../core/hooks/draft-create.js';
import { parseTaskKind } from '../../core/config/task-kind-layout.js';
import {
  workflowTaskKindErrorMessage,
  type WorkflowTaskKind,
} from '../../core/config/workflow-state.js';

/** 运行 draft-create 并设置 exitCode / stdout JSON */
export async function draftCreateCommand(repoRoot: string, kindRaw: string): Promise<void> {
  const kind = parseTaskKind(kindRaw);
  if (!kind) {
    console.error(JSON.stringify({ error: workflowTaskKindErrorMessage() }));
    process.exitCode = 2;
    return;
  }
  const result = await runDraftCreate(repoRoot, kind as WorkflowTaskKind);
  if (result.exitCode === 0) {
    console.log(
      JSON.stringify({
        kind,
        draft_name: result.draft_name,
        draft_dir: result.draft_dir,
      }),
    );
  } else if (result.exitCode === 1) {
    console.log(JSON.stringify({ kind, existing: result.existing }));
  } else {
    console.error(JSON.stringify({ error: result.error }));
  }
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
}
