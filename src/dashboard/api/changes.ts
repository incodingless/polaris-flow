/**
 * 变更列表与详情 API（`/api/changes`、`/api/changes/:name`），只读。
 *
 * 数据源：`openspec/changes/`（openspec 时代模型）。M2 将改为读取
 * `.polaris/workflow.yaml` 的 5 个任务数组 + `.polaris/tasks|testcases/<id>/state.yaml`。
 */
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { scanChanges, scanArchivedChanges, getChangeDetail } from '../change-scanner.js';

function mapChange(c: ReturnType<typeof getChangeDetail>) {
  const isArchived = c.phase === 'archived';
  return {
    name: c.name,
    phase: c.phase,
    summary: c.summary,
    created: c.created,
    labels: c.labels,
    currentGroup: c.currentGroup,
    schema: c.schema,
    workflowName: c.workflow?.canonical || c.workflow?.name || '',
    workflowShortName: c.workflow?.canonical || '',
    tasksTotal: c.tasksTotal,
    tasksDone: c.tasksDone,
    stepsDone: c.stepsDone,
    stepsTotal: c.stepsTotal,
    mtime: c.mtime,
    archivedDate: isArchived ? c.name.slice(0, 10) : undefined,
  };
}

export function listChanges(projectRoot: string, filter: 'all' | 'active' | 'archived' = 'active') {
  const activeChanges =
    filter === 'all' || filter === 'active' ? scanChanges(projectRoot).map(mapChange) : [];
  const archivedChanges =
    filter === 'all' || filter === 'archived'
      ? scanArchivedChanges(projectRoot).map(mapChange)
      : [];

  const tasks = filter === 'archived' ? archivedChanges : [...activeChanges, ...archivedChanges];

  return {
    tasks,
    counts: {
      active: scanChanges(projectRoot).length,
      archived: scanArchivedChanges(projectRoot).length,
    },
  };
}

export function getChange(projectRoot: string, name: string) {
  const changeDir = join(projectRoot, 'openspec', 'changes', name);
  if (existsSync(changeDir)) {
    return getChangeDetail(changeDir);
  }
  const archiveDir = join(projectRoot, 'openspec', 'changes', 'archive', name);
  if (existsSync(archiveDir)) {
    const detail = getChangeDetail(archiveDir);
    return { ...detail, phase: 'archived', archivedDate: name.slice(0, 10) };
  }
  return { error: `Change "${name}" not found` };
}

// toggleTask 刻意不提供：它直改 openspec/changes/<name>/tasks.md 的复选框，绕过 .polaris/.locks/。
// 「勾选任务」推迟到 M3，且必须落到 CLI 原语上（设计文档 §5.2）。
