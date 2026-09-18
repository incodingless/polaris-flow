/** 变更阶段顺序（用于计算已完成阶段） */
const PHASE_ORDER = ['proposal', 'design', 'specs', 'tasks']

/** 阶段展示标签 */
const PHASE_BADGE_LABELS = {
  proposal: 'Proposal 提案',
  design: 'Design 设计',
  specs: 'Specs 规格',
  tasks: 'Tasks 任务'
}

/** 阶段在流程中的索引，未知阶段返回 -1 */
function phaseIndex(phase) {
  if (phase === 'done' || phase === 'archived') return PHASE_ORDER.length
  return PHASE_ORDER.indexOf(phase)
}

/** 根据当前 phase 推导已完成的阶段徽章 */
export function getCompletedPhaseBadges(change) {
  const idx = phaseIndex(change.phase)
  const badges = PHASE_ORDER.slice(0, idx).map((p) => ({
    key: p,
    label: PHASE_BADGE_LABELS[p],
    type: p
  }))

  const otherCount = change.otherCount ?? change.otherFiles ?? 0
  if (otherCount > 0) {
    badges.push({ key: 'other', label: `Other ${otherCount}`, type: 'other' })
  }
  return badges
}

/** 变更阶段进度百分比：已完成阶段数 / 总阶段数 */
export function getChangeProgressPct(change) {
  const total = change.stepsTotal || PHASE_ORDER.length
  const done = typeof change.stepsDone === 'number'
    ? change.stepsDone
    : phaseIndex(change.phase)
  if (!total) return 0
  return Math.min(100, Math.round((done / total) * 100))
}

/** 规范差异条数（兼容多种 API 字段） */
export function getSpecDeltaCount(change) {
  return change.specDeltas
    ?? change.specDeltaCount
    ?? change.specsCount
    ?? (Array.isArray(change.specs) ? change.specs.length : null)
    ?? 0
}

/** 进度条颜色档位 */
export function progressBarClass(pct) {
  if (pct >= 100) return 'mini-progress__bar--high'
  if (pct >= 50) return 'mini-progress__bar--mid'
  return 'mini-progress__bar--low'
}

/** 格式化变更标题：英文名 + 中文摘要 */
export function formatChangeTitle(change) {
  const name = change.name || ''
  const summary = change.summary || change.title || ''
  if (summary && summary !== name) return `${name} ${summary}`
  return name
}

/** 格式化相对/绝对时间 */
export function formatTimestamp(iso) {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return iso
  }
}

/** 任务进度文案：已完成/总数 */
export function formatTaskStats(change) {
  const done = change.tasksDone ?? 0
  const total = change.tasksTotal ?? 0
  return `${done}/${total}`
}
