/**
 * `polaris draft-create` 命令。
 */
import { runDraftCreate } from '../../core/hooks/draft-create.js';

/** 运行 draft-create 并设置 exitCode / stdout JSON */
export async function draftCreateCommand(repoRoot: string): Promise<void> {
  const result = await runDraftCreate(repoRoot);
  if (result.exitCode === 0) {
    console.log(JSON.stringify({ draft_name: result.draft_name, draft_dir: result.draft_dir }));
  } else if (result.exitCode === 1) {
    console.log(JSON.stringify({ existing: result.existing }));
  } else {
    console.error(JSON.stringify({ error: result.error }));
  }
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
}
