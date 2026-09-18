/** 8 步工作流模板（4 阶段） */
export const WORKFLOW_TEMPLATE = [
  {
    name: 'PROPOSAL PREPARATION',
    steps: [
      { name: 'Created', number: 0 },
      { name: 'Optimizing', number: 1 },
      { name: 'Draft', number: 2 }
    ]
  },
  {
    name: 'REVIEW AND REFINE',
    steps: [
      { name: 'Generating', number: 3 },
      { name: 'Review', number: 4 }
    ]
  },
  {
    name: 'EXECUTION COMPLETE',
    steps: [
      { name: 'Executing', number: 5 },
      { name: 'Completed', number: 6 }
    ]
  },
  {
    name: 'ARCHIVE',
    steps: [
      { name: 'Archiving', number: 7 },
      { name: 'Archived', number: 8 }
    ]
  }
]

/** 根据当前步骤构建分组节点状态 */
export function buildStepGroups(activeStep, executionDone) {
  return WORKFLOW_TEMPLATE.map((group) => {
    const steps = group.steps.map((s) => {
      let status = 'pending'
      if (executionDone && s.number <= 6) status = 'done'
      else if (!executionDone && s.number < activeStep) status = 'done'
      else if (!executionDone && s.number === activeStep) status = 'active'
      return { ...s, status }
    })
    const allDone = steps.every((s) => s.status === 'done')
    const hasActive = steps.some((s) => s.status === 'active')
    const groupStatus = allDone ? 'completed' : hasActive ? 'active' : 'pending'
    return { name: group.name, status: groupStatus, steps }
  })
}

/** 为所有阶段步骤分配全局连续序号（从 1 开始） */
export function assignGlobalStepNumbers(stepGroups) {
  let n = 1
  return stepGroups.map((group) => ({
    ...group,
    steps: group.steps.map((step) => ({
      ...step,
      number: n++
    }))
  }))
}

/** 计算工作流进度元数据 */
export function workflowMeta(activeStep, executionDone) {
  const totalSteps = 9
  const doneSteps = executionDone ? 7 : activeStep
  const stepGroups = assignGlobalStepNumbers(buildStepGroups(activeStep, executionDone))
  const activeStepNode = stepGroups.flatMap((g) => g.steps).find((s) => s.status === 'active')
  return {
    stepGroups,
    currentStep: activeStepNode?.number ?? (executionDone ? 7 : Math.max(1, activeStep)),
    doneSteps,
    totalSteps,
    pct: Math.round((doneSteps / totalSteps) * 100)
  }
}

/** 判断任务是否已归档 */
export function isArchivedTask(task) {
  return task?.phase === 'archived' || !!task?.archivedDate
}

/** 去掉归档 slug 前的日期前缀，如 2026-04-06-build-customer → build-customer */
export function stripArchivedNameDate(name) {
  if (!name) return ''
  const matched = String(name).match(/^\d{4}-\d{2}-\d{2}-(.+)$/)
  return matched ? matched[1] : String(name)
}

/** 任务卡片/列表展示标题 */
export function formatTaskCardTitle(task) {
  if (!task) return ''
  if (task.title) return task.title
  if (isArchivedTask(task)) return stripArchivedNameDate(task.name)
  return task.name || ''
}

/** 任务卡片时间行文案 */
export function formatTaskCardTime(task) {
  const archived = isArchivedTask(task)
  const rawDate = archived ? task.archivedDate : task.created
  const date = rawDate ? String(rawDate).slice(0, 10) : ''
  if (archived) {
    return { text: date ? `归档于 ${date}` : '已归档', archived: true }
  }
  return { text: date ? `创建于 ${date}` : '', archived: false }
}

/** 相对时间格式化 */
export function formatRelativeTime(isoOrDate) {
  const d = new Date(isoOrDate)
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return mins + ' 分钟前'
  const hours = Math.floor(mins / 60)
  if (hours < 24) return hours + ' 小时前'
  const days = Math.floor(hours / 24)
  if (days < 30) return days + ' 天前'
  return d.toISOString().slice(0, 10)
}

/** 任务卡片阶段标签：空心样式，文字为当前阶段名 */
export function formatStageTag(task) {
  const label = task?.currentGroup || task?.status || '未知'
  const stepStatus = task?.currentStepStatus === 'done' ? 'done' : 'active'
  return {
    label,
    className: stepStatus === 'done' ? 'tag-outline-success' : 'tag-outline-warning'
  }
}

/** 状态标签样式类 */
export function statusTagClass(task) {
  const map = {
    success: 'tag-success',
    warning: 'tag-warning',
    error: 'tag-warning',
    info: 'tag-info',
    accent: 'tag-info'
  }
  return map[task.statusType] || 'tag-disabled'
}

/** 分组标签颜色 */
export function getGroupColor(tag) {
  const map = { BE: '#3b82f6', FE: '#38b950', FS: '#8b5cf6', TS: '#f59e0b', RQ: '#ef4444' }
  return map[tag] || '#6b7280'
}

/** 进度条颜色分级 */
export function progressClass(val) {
  if (val < 50) return 'detail-header__progress-fill--low'
  if (val < 100) return 'detail-header__progress-fill--mid'
  return 'detail-header__progress-fill--high'
}

/** 阶段导航与详情 Tab 映射 */
export const STAGE_TO_TAB = {
  proposal: 'proposal',
  design: 'design',
  tasks: 'tasks',
  specs: 'specs',
  other: 'other'
}

/** 标题栏左侧：内容阶段导航 */
export const STAGE_CONTENT_NAV_IDS = ['proposal', 'design', 'tasks', 'specs', 'other']

/** 标题栏右侧：会话操作导航 */
export const STAGE_ACTION_NAV_IDS = ['info', 'conversation', 'review']

export const STAGE_NAV_ITEMS = [
  { id: 'info', label: '详情' },
  { id: 'conversation', label: '检测' },
  { id: 'review', label: '查看' },
  { id: 'proposal', label: 'Proposal', separator: 'blue' },
  { id: 'design', label: 'Design', separator: 'orange' },
  { id: 'tasks', label: 'Tasks', separator: 'green' },
  { id: 'specs', label: 'Specs', separator: 'purple' },
  { id: 'other', label: 'Other', separator: 'gray' }
]

export const DETAIL_TABS = [
  { id: 'proposal', label: '提案', count: 1 },
  { id: 'design', label: '设计', count: 3 },
  { id: 'tasks', label: '任务', count: 6 },
  { id: 'specs', label: '规格差异', count: 2 },
  { id: 'other', label: '其他', count: 4 }
]

/** 流程缩略图：分隔线颜色与图标循环 */
const WORKFLOW_THUMB_SEP_COLORS = ['blue', 'orange', 'green', 'purple', 'gray']
const WORKFLOW_THUMB_ICON_IDS = ['proposal', 'design', 'tasks', 'specs', 'other']

export function getWorkflowThumbMeta(index) {
  return {
    separator: WORKFLOW_THUMB_SEP_COLORS[index % WORKFLOW_THUMB_SEP_COLORS.length],
    iconId: WORKFLOW_THUMB_ICON_IDS[index % WORKFLOW_THUMB_ICON_IDS.length]
  }
}

/** 扁平化步骤列表，附带所属分组名 */
export function flattenSteps(stepGroups = []) {
  return stepGroups.flatMap((group) =>
    (group.steps || []).map((step) => ({
      ...step,
      groupName: step.groupName || group.name,
      groupStatus: group.status
    }))
  )
}

/** 默认展示步骤：优先进行中，其次最后一个已完成，否则首个步骤 */
export function findActiveStep(stepGroups) {
  const steps = flattenSteps(stepGroups)
  if (!steps.length) return null
  const active = steps.find((s) => s.status === 'active')
  if (active) return active
  const doneSteps = steps.filter((s) => s.status === 'done')
  if (doneSteps.length) return doneSteps[doneSteps.length - 1]
  return steps[0]
}

/** 按全局序号查找步骤 */
export function findStepByNumber(stepGroups, number) {
  return flattenSteps(stepGroups).find((s) => s.number === number) || null
}

/** 查找指定步骤的下一个步骤 */
export function findNextStep(stepGroups, step) {
  if (!step) return null
  const steps = flattenSteps(stepGroups)
  const index = steps.findIndex((s) => s.number === step.number)
  if (index < 0 || index >= steps.length - 1) return null
  return steps[index + 1]
}

/**
 * 判断是否展示阶段操作按钮：
 * - 进行中步骤：展示当前阶段操作（如「继续」）
 * - 已完成步骤：仅当下一步为待执行时展示
 * - 其他状态：不展示
 */
export function shouldShowStepOperations(step, stepGroups, stepOperations = []) {
  if (!step || !stepOperations.length) return false
  if (step.status === 'active') return true
  if (step.status === 'done') {
    const next = findNextStep(stepGroups, step)
    return next?.status === 'pending'
  }
  return false
}

export const STEP_STATUS_LABELS = {
  done: '已完成',
  active: '进行中',
  pending: '待执行'
}

/** 完成条件文案 */
export function formatStepCheck(check) {
  if (!check?.type) return ''
  const typeLabels = {
    'file-exists': '文件存在',
    'dir-exists': '目录存在',
    'file-content': '文件内容',
    'tasks-done': '任务完成',
    none: '手动步骤'
  }
  const label = typeLabels[check.type] || check.type
  return check.path ? `${label}：${check.path}` : label
}

/** 无描述时的步骤说明兜底 */
export function stepFallbackText(step) {
  if (!step) return ''
  if (step.status === 'active') return '当前步骤进行中，完成后将自动进入下一步。'
  if (step.status === 'done') return '该步骤已完成。'
  return '该步骤尚未开始，需先完成前置步骤。'
}

