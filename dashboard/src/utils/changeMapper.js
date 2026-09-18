import { workflowMeta, assignGlobalStepNumbers, stripArchivedNameDate } from './workflow.js'

const PHASE_STATUS = {
  proposal: { status: 'Drafting', statusType: 'info' },
  design: { status: 'Reviewing', statusType: 'info' },
  specs: { status: 'Reviewing', statusType: 'info' },
  tasks: { status: '进行中', statusType: 'warning' },
  done: { status: 'Execution Complete', statusType: 'success' },
  archived: { status: 'Archived', statusType: 'accent' }
}

/** 从标签生成卡片分组标识 */
function toGroupTag(labels) {
  if (!labels?.length) return ''
  const label = String(labels[0])
  return label.slice(0, 2).toUpperCase()
}

/** phase 映射为展示状态 */
function mapPhaseStatus(phase) {
  return PHASE_STATUS[phase] || { status: phase || '未知', statusType: 'info' }
}

/** 解析当前阶段内步骤状态：active=进行中，done=已完成 */
function resolveCurrentStepStatus(change) {
  const { stepStatuses, workflow, currentGroup } = change
  if (stepStatuses && workflow?.groups?.length && currentGroup) {
    const group = workflow.groups.find((g) => g.name === currentGroup)
    if (group?.steps?.length) {
      const hasActive = group.steps.some((s) => stepStatuses[s.id] === 'active')
      if (hasActive) return 'active'
      const allDone = group.steps.every((s) => stepStatuses[s.id] === 'done')
      if (allDone) return 'done'
      return 'active'
    }
  }
  if (change.phase === 'done') return 'done'
  return 'active'
}

/** API 步骤状态转 UI 步骤状态 */
function mapStepStatus(apiStatus) {
  if (apiStatus === 'done') return 'done'
  if (apiStatus === 'active') return 'active'
  return 'pending'
}

/** 根据 workflow 与 stepStatuses 构建步骤分组 */
function buildStepGroupsFromWorkflow(workflow, stepStatuses) {
  if (!workflow?.groups?.length) return null

  const groups = workflow.groups.map((group) => {
    const steps = (group.steps || []).map((step) => ({
      id: step.id,
      name: step.name,
      description: step.description || '',
      check: step.check || null,
      groupName: group.name,
      status: mapStepStatus(stepStatuses?.[step.id])
    }))
    const allDone = steps.length > 0 && steps.every((s) => s.status === 'done')
    const hasActive = steps.some((s) => s.status === 'active')
    const groupStatus = allDone ? 'completed' : hasActive ? 'active' : 'pending'
    return { name: group.name, status: groupStatus, steps }
  })

  return assignGlobalStepNumbers(groups)
}

/** 根据 stepsDone / phase 生成进度元数据 */
function buildProgressMeta(change) {
  const executionDone = change.phase === 'done' || change.phase === 'archived'
  const activeStep = typeof change.stepsDone === 'number' ? change.stepsDone : 0

  const fromWorkflow = buildStepGroupsFromWorkflow(change.workflow, change.stepStatuses)
  if (fromWorkflow) {
    const totalSteps = fromWorkflow.reduce((sum, g) => sum + g.steps.length, 0)
    const doneSteps = fromWorkflow.reduce(
      (sum, g) => sum + g.steps.filter((s) => s.status === 'done').length,
      0
    )
    const activeStep = fromWorkflow.flatMap((g) => g.steps).find((s) => s.status === 'active')
    return {
      stepGroups: fromWorkflow,
      currentStep: activeStep?.number ?? Math.max(1, doneSteps),
      doneSteps,
      totalSteps: totalSteps || change.stepsTotal || 9,
      pct: totalSteps ? Math.round((doneSteps / totalSteps) * 100) : 0
    }
  }

  return workflowMeta(activeStep, executionDone)
}

/** 解析列表/卡片展示标题 */
function resolveTaskTitle(change) {
  if (change.summary) return change.summary
  if (change.phase === 'archived') return stripArchivedNameDate(change.name)
  return change.name
}

/** 列表项：Change → 任务卡片结构 */
export function mapChangeToTask(change, index = 0, projectPath = '') {
  const { status, statusType } = mapPhaseStatus(change.phase)
  const progress = buildProgressMeta(change)
  const changePath = projectPath && change.name
    ? `${projectPath}/openspec/changes/${change.name}`
    : ''

  return {
    id: change.name,
    displayId: 1000 - index,
    name: change.name,
    title: resolveTaskTitle(change),
    changePath,
    groupTag: toGroupTag(change.labels),
    time: change.mtime || change.created || new Date().toISOString(),
    created: change.created || '',
    archivedDate: change.archivedDate || '',
    phase: change.phase || '',
    currentGroup: change.currentGroup || '',
    labels: change.labels || [],
    currentStepStatus: resolveCurrentStepStatus(change),
    workflow: change.workflowName || change.schema || '',
    workflowShortName: change.workflowShortName || '',
    schemaId: change.schema || change.workflow?.id || change.workflow?.canonical || '',
    status,
    statusType,
    specs: change.labels?.length || 0,
    ...progress
  }
}

/** 详情：ChangeDetail → 任务详情结构 */
export function mapChangeDetail(change, index = 0, projectPath = '') {
  const base = mapChangeToTask(change, index, projectPath)
  return {
    ...base,
    background: change.summary || '',
    repos: [],
    files: change.files || [],
    specFiles: change.specs || [],
    specs: Array.isArray(change.specs) ? change.specs.length : 0,
    workflowPhases: [],
    artifactPhases: [],
    phase: change.phase,
    currentGroup: change.currentGroup || '',
    workflowError: change.workflowError
  }
}
