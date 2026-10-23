/**
 * 卡片/详情的展示助手。
 *
 * 旧的 `PHASE_ORDER = ['proposal','design','specs','tasks']` 与 `PHASE_BADGE_LABELS`
 * 是 openspec 时代的四件套阶段表，已整块作废 —— 现在的阶段与分组一律来自
 * `task.stepGroups`（由后端阶段表派生，映射见 `changeMapper.js`）。
 */

/** 根据步骤分组推导已完成的阶段徽章（含已跳过） */
export function getCompletedPhaseBadges(task) {
  const badges = []
  for (const group of task?.stepGroups || []) {
    for (const step of group.steps || []) {
      if (step.status === 'done' || step.status === 'skipped') {
        badges.push({
          key: step.id,
          label: step.name,
          type: step.status === 'skipped' ? 'skipped' : 'phase'
        })
      }
    }
  }
  return badges
}

/** 阶段进度百分比（优先用映射层算好的 pct，避免两处算法） */
export function getChangeProgressPct(task) {
  if (typeof task?.pct === 'number') return task.pct
  const total = task?.totalSteps || task?.stepsTotal || 0
  const done = typeof task?.doneSteps === 'number' ? task.doneSteps : 0
  if (!total) return 0
  return Math.min(100, Math.round((done / total) * 100))
}

/** 产物计数（列表卡片上的「规格」数字） */
export function getSpecDeltaCount(task) {
  if (typeof task?.specs === 'number') return task.specs
  if (Array.isArray(task?.specs)) return task.specs.length
  return 0
}

/** 进度条颜色档位 */
export function progressBarClass(pct) {
  if (pct >= 100) return 'mini-progress__bar--high'
  if (pct >= 50) return 'mini-progress__bar--mid'
  return 'mini-progress__bar--low'
}

/** 格式化任务标题：id + 标题（标题与 id 相同时只给 id） */
export function formatChangeTitle(task) {
  const name = task?.name || task?.id || ''
  const title = task?.title || ''
  if (title && title !== name) return `${name} ${title}`
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

/**
 * 任务进度文案：已完成/总数。
 * 只有声明了复选框产物的 kind（coding / debug）才有值，其余显示破折号
 * —— 旧的 `0/0` 会让「无此概念」看起来像「一条都没做」。
 */
export function formatTaskStats(task) {
  const total = task?.tasksTotal
  if (total === null || total === undefined) return '—'
  return `${task?.tasksDone ?? 0}/${total}`
}
