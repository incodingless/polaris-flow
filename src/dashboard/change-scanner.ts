import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, basename, dirname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  getWorkflowBySchema,
  flattenSteps,
  type WorkflowDef,
  type WorkflowStep,
  type GeneratedArtifact,
} from './api/workflow.js';

export const DEFAULT_SCHEMA = 'polaris-flow-backend';

interface CheckCtx {
  changeDir: string;
  changeName: string;
  projectRoot: string;
}

export interface TaskItem {
  index: number;
  text: string;
  done: boolean;
}

export interface ChangeFile {
  name: string;
  path: string;
  content: string;
}

export interface OpenspecConfig {
  schema: string;
  summary: string;
  created: string;
  labels: string[];
}

export interface ChangeDetail {
  name: string;
  phase: string;
  schema: string;
  summary: string;
  created: string;
  labels: string[];
  currentGroup: string;
  workflow: WorkflowDef | null;
  workflowError?: string;
  tasksTotal: number;
  tasksDone: number;
  stepsDone: number;
  stepsTotal: number;
  mtime: string;
  files: ChangeFile[];
  specs: ChangeFile[];
  stepStatuses: Record<string, 'done' | 'active' | 'pending' | 'not_executed'>;
  artifactStatuses: Record<string, boolean>;
}

export interface ChangeStats {
  totalChanges: number;
  totalTasks: number;
  doneTasks: number;
  pendingTasks: number;
}

export function readOpenspecYaml(changeDir: string): OpenspecConfig {
  const configPath = join(changeDir, '.openspec.yaml');
  const defaults: OpenspecConfig = { schema: DEFAULT_SCHEMA, summary: '', created: '', labels: [] };
  if (!existsSync(configPath)) {
    return defaults;
  }
  try {
    const raw = readFileSync(configPath, 'utf8');
    const parsed = parseYaml(raw) as Record<string, unknown>;
    return {
      schema:
        typeof parsed.schema === 'string' && parsed.schema.trim()
          ? parsed.schema.trim()
          : DEFAULT_SCHEMA,
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      created: typeof parsed.created === 'string' ? parsed.created : '',
      labels: Array.isArray(parsed.labels)
        ? (parsed.labels.filter((l: unknown) => typeof l === 'string') as string[])
        : [],
    };
  } catch {
    return defaults;
  }
}

/** 读取 change 目录下的 .openspec.yaml，获取 schema 字段 */
export function readChangeSchema(changeDir: string): string {
  return readOpenspecYaml(changeDir).schema;
}

export function parseTasksMd(content: string): TaskItem[] {
  const lines = content.split('\n');
  const tasks: TaskItem[] = [];
  let index = 0;
  for (const line of lines) {
    const match = line.match(/^\s*- \[(.)\] (.+)/);
    if (match) {
      tasks.push({ index: index++, text: match[2]!.trim(), done: match[1] !== ' ' });
    }
  }
  return tasks;
}

export function getChangePhase(changeDir: string): string {
  if (!existsSync(changeDir)) return 'proposal';

  const tasksPath = join(changeDir, 'tasks.md');
  if (existsSync(tasksPath)) {
    const content = readFileSync(tasksPath, 'utf8');
    const tasks = parseTasksMd(content);
    if (tasks.length > 0 && tasks.every((t) => t.done)) {
      return 'done';
    }
    return 'tasks';
  }

  if (
    existsSync(join(changeDir, 'tech-design.md')) ||
    existsSync(join(changeDir, 'db-design.md')) ||
    existsSync(join(changeDir, 'rest-api-design.md'))
  ) {
    return 'design';
  }

  const specsDir = join(changeDir, 'specs');
  if (existsSync(specsDir)) {
    try {
      const entries = readdirSync(specsDir, { recursive: true });
      if (entries.some((e) => (e as string).endsWith('.md'))) return 'specs';
    } catch {
      // 目录不可读时按「不存在」处理
    }
  }

  if (existsSync(join(changeDir, 'proposal.md'))) {
    return 'proposal';
  }

  return 'proposal';
}

function listChangeFiles(changeDir: string): ChangeFile[] {
  const result: ChangeFile[] = [];
  if (!existsSync(changeDir)) return result;
  const walk = (dir: string, prefix: string) => {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name);
        const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          walk(fullPath, relPath);
        } else if (entry.name.endsWith('.md') || entry.name.endsWith('.yaml')) {
          result.push({
            name: relPath,
            path: relPath,
            content: readFileSync(fullPath, 'utf8'),
          });
        }
      }
    } catch {
      // 单个文件不可读时跳过，不影响其余文件
    }
  };
  walk(changeDir, '');
  return result;
}

function checkFileExists(ctx: CheckCtx, path: string): boolean {
  return existsSync(join(ctx.changeDir, path));
}

function checkDirHasMd(ctx: CheckCtx, path: string): boolean {
  const dir = join(ctx.changeDir, path);
  if (!existsSync(dir)) return false;
  try {
    const entries = readdirSync(dir, { recursive: true });
    return entries.some((e) => (e as string).endsWith('.md'));
  } catch {
    return false;
  }
}

function checkTasksAllChecked(ctx: CheckCtx, path: string): boolean {
  const tasksPath = join(ctx.changeDir, path);
  if (!existsSync(tasksPath)) return false;
  const content = readFileSync(tasksPath, 'utf8');
  const tasks = parseTasksMd(content);
  return tasks.length > 0 && tasks.every((t) => t.done);
}

function checkMarkdownSection(ctx: CheckCtx, path: string, section: string): boolean {
  const filePath = join(ctx.changeDir, path);
  if (!existsSync(filePath)) return false;
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  let inSection = false;
  const checkboxes: boolean[] = [];
  for (const line of lines) {
    if (/^##\s/.test(line) || /^#\s/.test(line)) {
      if (inSection) break;
      if (line.includes(section)) {
        inSection = true;
      }
      continue;
    }
    if (inSection) {
      const match = line.match(/^\s*- \[(.)\] /);
      if (match) {
        checkboxes.push(match[1] !== ' ');
      }
    }
  }
  return checkboxes.length > 0 && checkboxes.every((c) => c);
}

function checkGitWorktree(ctx: CheckCtx): boolean {
  try {
    const output = execSync('git worktree list', {
      cwd: ctx.projectRoot,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    return output.includes(ctx.changeName);
  } catch {
    return false;
  }
}

function checkArchiveExists(ctx: CheckCtx): boolean {
  const archiveDir = join(ctx.projectRoot, 'openspec', 'changes', 'archive');
  if (!existsSync(archiveDir)) return false;
  try {
    for (const entry of readdirSync(archiveDir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.endsWith('-' + ctx.changeName)) {
        return true;
      }
    }
  } catch {
    /* ignore read errors */
  }
  return false;
}

function checkGitBranchMerged(ctx: CheckCtx): boolean {
  try {
    const merged = execSync('git branch --merged HEAD', {
      cwd: ctx.projectRoot,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    return merged.includes(ctx.changeName);
  } catch {
    return false;
  }
}

function isArtifactDone(ctx: CheckCtx, artifact: GeneratedArtifact): boolean {
  switch (artifact.check) {
    case 'none':
      return true;
    case 'file-exists':
      return checkFileExists(ctx, artifact.file!);
    case 'dir-has-md':
      return checkDirHasMd(ctx, artifact.file!);
    case 'tasks-all-checked':
      return checkTasksAllChecked(ctx, artifact.file!);
    case 'markdown-section-done':
      return checkMarkdownSection(ctx, artifact.file!, artifact.section!);
    case 'git-worktree-exists':
      return checkGitWorktree(ctx);
    case 'archive-exists':
      return checkArchiveExists(ctx);
    case 'git-branch-merged':
      return checkGitBranchMerged(ctx);
    default:
      return false;
  }
}

function isStepDone(ctx: CheckCtx, step: WorkflowStep): boolean {
  const artifacts = step.generated;
  if (!artifacts || artifacts.length === 0) return false;
  return artifacts.every((a) => isArtifactDone(ctx, a));
}

/** 按 workflow 步骤顺序计算各节点状态 */
export function computeStepStatuses(
  changeDir: string,
  steps: WorkflowStep[],
): Record<string, 'done' | 'active' | 'pending' | 'not_executed'> {
  const changeName = basename(changeDir);
  const projectRoot = dirname(dirname(dirname(changeDir)));
  const ctx: CheckCtx = { changeDir, changeName, projectRoot };

  let foundActive = false;
  const result: Record<string, 'done' | 'active' | 'pending' | 'not_executed'> = {};

  for (const step of steps) {
    const artifacts = step.generated;
    if (!artifacts || artifacts.length === 0) {
      result[step.id] = 'not_executed';
      continue;
    }

    const done = isStepDone(ctx, step);

    if (done) {
      result[step.id] = 'done';
    } else if (!foundActive) {
      result[step.id] = 'active';
      foundActive = true;
    } else {
      result[step.id] = 'pending';
    }
  }

  return result;
}

/** 按 stepId:index 计算每个产出物的独立布尔状态 */
export function computeArtifactStatuses(
  changeDir: string,
  steps: WorkflowStep[],
): Record<string, boolean> {
  const changeName = basename(changeDir);
  const projectRoot = dirname(dirname(dirname(changeDir)));
  const ctx: CheckCtx = { changeDir, changeName, projectRoot };
  const result: Record<string, boolean> = {};

  for (const step of steps) {
    const artifacts = step.generated;
    if (!artifacts || artifacts.length === 0) continue;
    artifacts.forEach((artifact, idx) => {
      const key = `${step.id}:${idx}`;
      result[key] = isArtifactDone(ctx, artifact);
    });
  }

  return result;
}

export function getChangeDetail(changeDir: string): ChangeDetail {
  const name = basename(changeDir);
  const phase = getChangePhase(changeDir);
  const files = listChangeFiles(changeDir);
  const config = readOpenspecYaml(changeDir);
  const schema = config.schema;
  const workflow = getWorkflowBySchema(schema);

  let workflowError: string | undefined;
  let steps: WorkflowStep[];
  if (workflow) {
    steps = flattenSteps(workflow);
  } else {
    workflowError = `tasks.yaml 中未找到 schema "${schema}" 对应的 workflow`;
    steps = [];
  }

  let tasksTotal = 0;
  let tasksDone = 0;
  const tasksFile = files.find((f) => f.name === 'tasks.md');
  if (tasksFile) {
    const tasks = parseTasksMd(tasksFile.content);
    tasksTotal = tasks.length;
    tasksDone = tasks.filter((t) => t.done).length;
  }

  let mtime = '';
  try {
    mtime = statSync(changeDir).mtime.toISOString();
  } catch {
    // 取不到时间戳不影响其余字段
  }

  const stepStatuses = steps.length > 0 ? computeStepStatuses(changeDir, steps) : {};
  const artifactStatuses = steps.length > 0 ? computeArtifactStatuses(changeDir, steps) : {};

  let stepsDone = 0;
  const stepsTotal = steps.length;
  for (const step of steps) {
    if (stepStatuses[step.id] === 'done') {
      stepsDone++;
    }
  }

  let currentGroup = '';
  if (workflow) {
    let lastNonPendingStepId = '';
    for (const step of steps) {
      const s = stepStatuses[step.id];
      if (s && s !== 'pending') {
        lastNonPendingStepId = step.id;
      }
    }
    if (lastNonPendingStepId) {
      for (const group of workflow.groups) {
        if (group.steps.some((s) => s.id === lastNonPendingStepId)) {
          currentGroup = group.name;
          break;
        }
      }
    }
  }

  const specs = files.filter((f) => f.name.startsWith('specs/'));

  return {
    name,
    phase,
    schema: config.schema,
    summary: config.summary,
    created: config.created,
    labels: config.labels,
    currentGroup,
    workflow,
    workflowError,
    tasksTotal,
    tasksDone,
    stepsDone,
    stepsTotal,
    mtime,
    files,
    specs,
    stepStatuses,
    artifactStatuses,
  };
}

export function scanChanges(projectRoot: string): ChangeDetail[] {
  const changesDir = join(projectRoot, 'openspec', 'changes');
  if (!existsSync(changesDir)) return [];

  const names = readdirSync(changesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== 'archive')
    .map((d) => d.name);

  return names
    .map((name) => getChangeDetail(join(changesDir, name)))
    .sort((a, b) => b.mtime.localeCompare(a.mtime) || a.name.localeCompare(b.name));
}

export function scanArchivedChanges(projectRoot: string): ChangeDetail[] {
  const archiveDir = join(projectRoot, 'openspec', 'changes', 'archive');
  if (!existsSync(archiveDir)) return [];

  const names = readdirSync(archiveDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  return names
    .map((name) => {
      const detail = getChangeDetail(join(archiveDir, name));
      return { ...detail, phase: 'archived' };
    })
    .sort((a, b) => b.mtime.localeCompare(a.mtime) || a.name.localeCompare(b.name));
}

export function computeStats(projectRoot: string): ChangeStats {
  const changes = scanChanges(projectRoot);
  return {
    totalChanges: changes.length,
    totalTasks: changes.reduce((sum, c) => sum + c.tasksTotal, 0),
    doneTasks: changes.reduce((sum, c) => sum + c.tasksDone, 0),
    pendingTasks: changes.reduce((sum, c) => sum + (c.tasksTotal - c.tasksDone), 0),
  };
}
