/**
 * 阶段与步骤的展示层助手 —— **数据源是后端阶段表**（`src/core/config/task-kind-layout.ts`），
 * 本文件不再自持任何阶段清单。
 *
 * 旧实现硬编码了 openspec 时代的 9 步模板（Created/Optimizing/Draft/Generating/Review/
 * Executing/Completed/Archiving/Archived）与「四件套」Tab，已整块移除。
 */

/** kind 缩写（卡片角标用；纯展示，与阶段表无关） */
export const KIND_ABBR = {
  coding: 'COD',
  requirement: 'REQ',
  testcase: 'TC',
  prototype: 'PRO',
  debug: 'DBG'
}

/** 不在阶段表里、但会出现在 `phase` 字段里的特殊值 */
export const PHASE_EXTRA_LABELS = {
  idle: '空闲',
  archived: '已归档'
}

/** 历史别名：写盘一律用现行名，读到时归一，避免「静默显示未知阶段」 */
const PHASE_ALIASES = {
  delivery: 'ship',
  archive: 'ship'
}

/** 归一阶段名（别名 → 现行名） */
export function normalizePhase(phase) {
  const raw = String(phase ?? '').trim()
  return PHASE_ALIASES[raw] ?? raw
}

/** 阶段显示名：优先用后端阶段表给的中文名，其次特殊值表，最后回落原值 */
export function displayPhase(phase, phaseNames = {}) {
  const code = normalizePhase(phase)
  if (!code) return '未开始'
  return phaseNames[code] || PHASE_EXTRA_LABELS[code] || code
}

/**
 * 模式显示名。`state.yaml` 的历史值域含 `sdd`，现行值域是 `tweak|normal|full`
 * —— 两者视为同一档（`sdd` 即 `normal`），未登记值原样显示，不显示为空白。
 */
export function displayMode(mode) {
  const raw = String(mode ?? '').trim()
  if (!raw) return ''
  if (raw === 'sdd') return 'normal'
  return raw
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

/** 进度元数据（步骤条用） */
/** 判断任务是否已归档（后端对归档项给合成 phase `archived`） */
export function isArchivedTask(task) {
  return task?.phase === 'archived' || !!task?.archivedAt || !!task?.archivedDate
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
/** 类型角标颜色（按 kind，旧的 BE/FE/FS/TS/RQ 标签色已作废） */
export function getGroupColor(tag) {
  const map = {
    COD: '#3b82f6',
    REQ: '#8b5cf6',
    TC: '#f59e0b',
    PRO: '#38b950',
    DBG: '#ef4444'
  }
  return map[tag] || '#6b7280'
}

/** 进度条颜色分级 */
export function progressClass(val) {
  if (val < 50) return 'detail-header__progress-fill--low'
  if (val < 100) return 'detail-header__progress-fill--mid'
  return 'detail-header__progress-fill--high'
}

/** 标题栏右侧：会话操作导航（与阶段无关的固定项） */
export const STAGE_ACTION_NAV_IDS = ['info', 'conversation', 'review']

export const STAGE_ACTION_NAV_ITEMS = [
  { id: 'info', label: '详情' },
  { id: 'conversation', label: '检测' },
  { id: 'review', label: '查看' }
]

/** 分隔线颜色循环（阶段分组按序取色） */
const WORKFLOW_THUMB_SEP_COLORS = ['blue', 'orange', 'green', 'purple', 'gray']

export function getWorkflowThumbMeta(index) {
  return {
    separator: WORKFLOW_THUMB_SEP_COLORS[index % WORKFLOW_THUMB_SEP_COLORS.length],
    iconId: 'other'
  }
}

/**
 * 内容导航项 = 操作导航（固定） + 该任务的**阶段分组**。
 * 分组名即 Tab id；「四件套」那套 hardcoded Tab 已作废。
 */
export function buildStageNavItems(task) {
  const groups = (task?.stepGroups || []).map((group, index) => ({
    id: group.name,
    label: group.name,
    separator: WORKFLOW_THUMB_SEP_COLORS[index % WORKFLOW_THUMB_SEP_COLORS.length]
  }))
  return [...STAGE_ACTION_NAV_ITEMS, ...groups]
}

/** 阶段/Tab id → 实际 Tab；不是本任务的阶段分组时归「other」 */
export function resolveStageTab(task, id) {
  if (!id) return ''
  const names = (task?.stepGroups || []).map((g) => g.name)
  return names.includes(id) ? id : 'other'
}

export const STEP_STATUS_LABELS = {
  done: '已完成',
  active: '进行中',
  pending: '待执行',
  skipped: '已跳过'
}

/**
 * 阶段产物文案。
 *
 * 旧实现解析的是 openspec 时代的 `check.type`（`file-content` / `tasks-done` / `none` 等
 * 由 `config/tasks.yaml` 声明）。M2 起产物由后端产物表给出，映射层把该阶段的产物
 * 折成 `{ type: 'file-exists' | 'dir-exists', path }` —— 本函数只负责渲染。
 */
export function formatStepCheck(check) {
  if (!check?.type) return ''
  const typeLabels = {
    'file-exists': '产物',
    'dir-exists': '产物目录'
  }
  const label = typeLabels[check.type] || check.type
  return check.path ? `${label}：${check.path}` : label
}

/** 无描述时的步骤说明兜底 */
export function stepFallbackText(step) {
  if (!step) return ''
  if (step.status === 'active') return '当前阶段进行中。'
  if (step.status === 'done') return '该阶段已完成。'
  if (step.status === 'skipped') return '该阶段已跳过。'
  return '该阶段尚未开始。'
}
