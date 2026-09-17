/**
 * Phase 2/3 hooks 的 Commander 命令包装（stdout JSON / exitCode）。
 */
import { runConstitutionValidity } from '../../core/hooks/constitution-validity.js';
import { runHarnessSync, type HarnessSyncConflictMode } from '../../core/hooks/harness-sync.js';
import { runDeliveryCleanup } from '../../core/hooks/delivery-cleanup.js';
import { runTasksLint } from '../../core/hooks/tasks-lint.js';
import { createHotfixBranch, mergeBranchToMain } from '../../core/hooks/git-branch.js';
import { create, merge, rebase, commitAndRemove } from '../../core/hooks/worktree.js';
import { draftCreateCommand } from './draft-create.js';
import { intentionValidateCommand } from './intention-validate.js';
import { taskFinalizeCommand } from './task-finalize.js';
import { taskInitCommand } from './task-init.js';

export { draftCreateCommand, intentionValidateCommand, taskInitCommand, taskFinalizeCommand };

/** tasks-lint */
export async function tasksLintCommand(filePath: string): Promise<void> {
  const result = await runTasksLint(filePath);
  console.log(JSON.stringify({ pass: result.pass, violations: result.violations }));
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
}

/** constitution-validity */
export async function constitutionValidityCommand(projectPath?: string): Promise<void> {
  const result = await runConstitutionValidity(projectPath || process.cwd());
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
}

/** worktree-create */
export async function worktreeCreateCommand(changeId: string, mainRepoRoot: string): Promise<void> {
  const result = await create(changeId, mainRepoRoot);
  if (result.payload) {
    console.log(JSON.stringify(result.payload));
  }
  if (result.message) {
    console.error(`[easy-flow] 阻断：${result.message}`);
  }
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
}

/** worktree-commit-remove：worktree 内提交后 remove */
export async function worktreeCommitRemoveCommand(
  worktreePath: string,
  message: string,
): Promise<void> {
  const result = await commitAndRemove(worktreePath, message);
  if (result.payload) {
    console.log(JSON.stringify(result.payload));
  }
  if (result.message) {
    console.error(`[worktree-commit-remove] 阻断：${result.message}`);
  }
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
}

/** hotfix-branch-create：基于主干建 hotfix/<issue_id> 并切换 */
export async function hotfixBranchCreateCommand(
  issueId: string,
  repoRoot: string,
): Promise<void> {
  const result = await createHotfixBranch(issueId, repoRoot);
  if (result.payload) {
    console.log(JSON.stringify(result.payload));
  }
  if (result.message) {
    console.error(`[hotfix-branch-create] 阻断：${result.message}`);
  }
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
}

/** git-branch-merge：将指定分支 merge --no-ff 进主干 */
export async function gitBranchMergeCommand(
  sourceBranch: string,
  repoRoot: string,
): Promise<void> {
  const result = await mergeBranchToMain(sourceBranch, repoRoot);
  if (result.payload) {
    console.log(JSON.stringify(result.payload));
  }
  if (result.message) {
    console.error(`[git-branch-merge] 阻断：${result.message}`);
  }
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
}

/** worktree-merge-status */
export async function worktreeMergeStatusCommand(
  worktreePath: string,
  originRepo: string,
  branch: string,
): Promise<void> {
  const result = await merge(worktreePath, originRepo, branch);
  if (result.message) {
    console.error(`[worktree-merge-status] ${result.message}`);
  }
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
}

/** worktree-rebase-ff */
export async function worktreeRebaseFfCommand(
  worktreePath: string,
  originRepo: string,
  branch: string,
): Promise<void> {
  const result = await rebase(worktreePath, originRepo, branch);
  if (result.message) {
    console.error(`[worktree-rebase-ff] 阻断：${result.message}`);
  }
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
}

/** harness-sync */
export async function harnessSyncCommand(
  worktreePath: string,
  originRepo: string,
  changeId: string,
  conflictMode?: string,
): Promise<void> {
  const mode = (conflictMode || '') as HarnessSyncConflictMode;
  const result = await runHarnessSync(worktreePath, originRepo, changeId, mode);
  console.log(
    JSON.stringify({
      metrics_files: result.metrics_files,
      overrides_lines: result.overrides_lines,
      state_yaml: result.state_yaml,
      pre_design: result.pre_design,
    }),
  );
  if (result.message) {
    console.error(`[harness-sync] ${result.message}`);
  }
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
}

/** ship-cleanup */
export async function shipCleanupCommand(changeId: string, originRepo: string): Promise<void> {
  const result = await runDeliveryCleanup(changeId, originRepo);
  if (result.message) {
    console.error(`[ship-cleanup] ${result.message}`);
  }
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
}
