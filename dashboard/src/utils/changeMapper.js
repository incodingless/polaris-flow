/**
 * 适配层：把 `/api/tasks` 的响应（新模型）映射成组件既有的数据结构。
 *
 * 为什么要这一层：M2 换了数据源与字段名，但 `components/**` 与 `views/**` 的渲染契约
 * 是「步骤分组 + 文件分组 + 状态标签」。把差异**收敛在这一个文件**，组件就无需跟着改；
 * 若把新字段直接透给组件，改动会散到十几个 `.vue` 里。
 *
 * 新模型的字段含义见 `docs/specs/2026-09-18-dashboard-api-contract.md`。
 */
import { KIND_ABBR, assignGlobalStepNumbers, displayPhase } from './workflow.js'

/**
 * 把该阶段的产物折成步骤的 `check` 字段（组件里的产物文案行用）。
 * 产物可能有多条（如 plan 阶段的四件套），只展示第一条并在有多条时标注「等 N 项」。
 */
function checkOfPhase(task, phaseCode) {
  const items = (task.artifacts || []).filter((a) => a.phase === phaseCode)
  if (!items.length) return undefined
  const first = items[0]
  const more = items.length > 1 ? ` 等 ${items.length} 项` : ''
  return {
    type: first.kind === 'dir' ? 'dir-exists' : 'file-exists',
    path: `${first.relPath}${more}`
  }
}

/** 阶段分组（后端形状）→ 步骤分组（组件形状），并补全局序号 */
function buildStepGroups(task) {
  const groups = (task.phase_groups || []).map((group) => ({
    name: group.name,
    status: group.status,
    steps: (group.phases || []).map((phase) => ({
      id: phase.code,
      name: phase.name,
      description: '',
      status: phase.status,
      optional: phase.optional === true,
      check: checkOfPhase(task, phase.code)
    }))
  }))
  return assignGlobalStepNumbers(groups)
}

/** 由阶段分组造「阶段码 → 中文名」表（用于显示当前阶段名） */
function phaseNameMap(task) {
  const map = {}
  for (const group of task.phase_groups || []) {
    for (const phase of group.phases || []) {
      map[phase.code] = phase.name
    }
  }
  return map
}

/** 是否全阶段走完（含已跳过） */
function isAllDone(task) {
  const groups = task.phase_groups || []
  return groups.length > 0 && groups.every((g) => g.status === 'completed')
}

/** 列表项状态标签（旧的 PHASE_STATUS 表已作废：它按 openspec 的 phase 名硬编码） */
function mapStatus(task) {
  if (task.phase === 'archived' || task.archived_at) {
    return { status: '已归档', statusType: 'accent' }
  }
  const allDone = isAllDone(task)
  const activeGroup = (task.phase_groups || []).find((g) => g.status === 'active')
  const label = allDone
    ? '已完成'
    : activeGroup?.name || displayPhase(task.phase, phaseNameMap(task))
  return { status: label, statusType: allDone ? 'success' : 'warning' }
}

/** 当前步骤状态：done / active（组件只用这两个值） */
function resolveCurrentStepStatus(task) {
  return isAllDone(task) ? 'done' : 'active'
}

/** 已存在的产物数（列表卡片上的「规格」计数） */
function existingArtifactCount(task) {
  return (task.artifacts || []).filter((a) => a.exists).length
}

/** 任务路径（绝对） */
function taskPathOf(task, projectPath) {
  if (!projectPath || !task.task_path) return ''
  return `${projectPath}/${task.task_path}`
}

/** 列表项：TaskItem → 任务卡片结构 */
export function mapChangeToTask(task, index = 0, projectPath = '') {
  const { status, statusType } = mapStatus(task)
  const stepGroups = buildStepGroups(task)
  const allSteps = stepGroups.flatMap((g) => g.steps)
  const doneSteps = allSteps.filter((s) => s.status === 'done' || s.status === 'skipped').length
  const totalSteps = allSteps.length
  const activeStep = allSteps.find((s) => s.status === 'active')
  const activeGroup = stepGroups.find((g) => g.status === 'active')
  const kindLabel = task.kind_label || task.kind || ''

  return {
    id: task.task_id,
    displayId: 1000 - index,
    name: task.task_id,
    kind: task.kind || '',
    kindLabel,
    title: task.title || task.task_id,
    changePath: taskPathOf(task, projectPath),
    taskPath: task.task_path || '',
    // 角标改用 kind 缩写（旧的 labels[0] 取前两字母已作废）
    groupTag: KIND_ABBR[task.kind] || '',
    time: task.started_at || task.updated_at || task.archived_at || '',
    created: task.started_at || '',
    archivedDate: task.archived_at || '',
    phase: task.phase || '',
    // 未知阶段不隐藏：原样显示，由 statusType 提示异常
    phaseLabel: displayPhase(task.phase, phaseNameMap(task)),
    phaseKnown: task.phase_known !== false,
    mode: task.mode || '',
    channel: task.channel || '',
    worktreePath: task.worktree_path || '',
    // 搜索用：类型名 + 通道
    labels: [kindLabel, task.channel].filter(Boolean),
    currentGroup: task.phase_group || '',
    currentStepStatus: resolveCurrentStepStatus(task),
    // kind 即 workflowId（后端契约）
    workflow: kindLabel,
    workflowShortName: task.kind || '',
    schemaId: task.kind || '',
    status,
    statusType,
    specs: existingArtifactCount(task),
    // 仪表台活动卡片的字段名（与 specs 同值）
    specCount: existingArtifactCount(task),
    tasksDone: task.tasks_done,
    tasksTotal: task.tasks_total,
    stepGroups,
    currentStep: activeStep?.number ?? Math.max(1, doneSteps),
    doneSteps,
    totalSteps,
    pct: totalSteps ? Math.round((doneSteps / totalSteps) * 100) : 0,
    _activeGroupName: activeGroup?.name || ''
  }
}

/** 详情：TaskDetail → 任务详情结构（含文件、产物、Tab 所需的阶段定义） */
export function mapChangeDetail(task, index = 0, projectPath = '') {
  const base = mapChangeToTask(task, index, projectPath)
  const files = task.files || []
  // 规格文件 = openspec 侧文档（文件路径已是项目根相对 posix）
  const specFiles = files.filter((f) => (f.path || '').startsWith('openspec/'))

  const workflowPhases = (task.phase_groups || [])
    .flatMap((group) => group.phases || [])
    .map((phase) => ({ code: phase.code, name: phase.name }))
  // 「其他」桶：未匹配任何产物的文件（如 state.yaml）落这里
  workflowPhases.push({ code: 'other', name: '其他' })

  // 产物按阶段分组（形状与组件里 categorizeChangeFiles 的期望一致）
  const artifactByPhase = new Map()
  for (const artifact of task.artifacts || []) {
    if (!artifactByPhase.has(artifact.phase)) {
      artifactByPhase.set(artifact.phase, [])
    }
    artifactByPhase.get(artifact.phase).push({
      stepId: artifact.phase,
      file: artifact.relPath,
      name: artifact.relPath.split('/').pop() || artifact.relPath,
      description: '',
      check: artifact.kind === 'dir' ? 'dir-has-md' : 'file-exists',
      exists: artifact.exists === true
    })
  }
  const artifactPhases = [...artifactByPhase.entries()].map(([code, artifacts]) => ({
    code,
    name: workflowPhases.find((p) => p.code === code)?.name || code,
    artifacts
  }))

  return {
    ...base,
    background: task.title || '',
    repos: [],
    files,
    specFiles,
    specs: specFiles.length,
    workflowPhases,
    artifactPhases,
    stateMissing: task.state_missing === true
  }
}
