import { ref, computed } from 'vue'
import { store } from '../stores/index.js'
import { fetchChanges, fetchConfigs, fetchStats } from '../api/index.js'
import { mapChangeToTask } from '../utils/changeMapper.js'
import {
  getChangeProgressPct,
  getSpecDeltaCount,
  formatChangeTitle,
  formatTimestamp,
  formatTaskStats,
  getCompletedPhaseBadges
} from '../utils/dashboardHelpers.js'

/** 仪表台数据：统计卡片、活动变更、最近活动 */
export function useDashboard() {
  const loading = ref(false)
  const error = ref('')
  const activeChanges = ref([])
  const recentActivity = ref([])
  const stats = ref({
    activeCount: 0,
    archivedCount: 0,
    referenceSpecCount: 0,
    taskPct: 0,
    tasksDone: 0,
    tasksTotal: 0
  })

  const hasProject = computed(() => !!store.activeProject?.path)

  /** 将原始变更映射为仪表台卡片结构 */
  function mapToDashboardChange(change, index, projectPath) {
    const task = mapChangeToTask(change, index, projectPath)
    const pct = getChangeProgressPct(change)
    return {
      id: change.name,
      title: formatChangeTitle(change),
      name: change.name,
      badges: getCompletedPhaseBadges(change),
      updatedAt: formatTimestamp(change.mtime || change.created),
      specDeltas: getSpecDeltaCount(change),
      taskStats: formatTaskStats(change),
      progressPct: pct,
      phase: change.phase,
      raw: change
    }
  }

  /** 统计参考规范数量（openspec/specs 目录下的文件） */
  async function loadReferenceSpecCount(project) {
    const { data, error: cfgErr } = await fetchConfigs(project)
    if (cfgErr || !data) return 0
    return data.filter((f) => {
      const p = f.path || f.name || ''
      return p.includes('openspec/specs/') && !p.endsWith('/')
    }).length
  }

  /** 加载仪表台全量数据 */
  async function loadDashboard() {
    const project = store.activeProject
    if (!project?.path) {
      activeChanges.value = []
      recentActivity.value = []
      stats.value = {
        activeCount: 0,
        archivedCount: 0,
        referenceSpecCount: 0,
        taskPct: 0,
        tasksDone: 0,
        tasksTotal: 0
      }
      return
    }

    loading.value = true
    error.value = ''

    try {
      const [activeRes, allRes, specCount, statsRes] = await Promise.all([
        fetchChanges(project, 'active'),
        fetchChanges(project, 'all'),
        loadReferenceSpecCount(project),
        fetchStats().catch(() => null)
      ])

      if (activeRes.error) {
        error.value = activeRes.error
        return
      }

      const projectPath = project.path
      const activeList = (activeRes.data?.tasks || []).map((c, i) =>
        mapToDashboardChange(c, i, projectPath)
      )
      activeChanges.value = activeList

      const allTasks = allRes.data?.tasks || []
      const sorted = [...allTasks].sort(
        (a, b) => new Date(b.mtime || b.created || 0) - new Date(a.mtime || a.created || 0)
      )
      recentActivity.value = sorted.slice(0, 12).map((c, i) => {
        const mapped = mapToDashboardChange(c, i, projectPath)
        return {
          ...mapped,
          specCount: getSpecDeltaCount(c),
          taskStats: formatTaskStats(c)
        }
      })

      const counts = activeRes.data?.counts || {}
      const allCounts = allRes.data?.counts || {}

      let tasksDone = 0
      let tasksTotal = 0
      for (const t of allTasks) {
        tasksDone += t.tasksDone ?? 0
        tasksTotal += t.tasksTotal ?? 0
      }

      // 优先使用 /api/stats 聚合结果（多项目场景）
      if (statsRes && !statsRes.error) {
        tasksDone = statsRes.doneTasks ?? tasksDone
        tasksTotal = statsRes.totalTasks ?? tasksTotal
      }

      const taskPct = tasksTotal ? Math.round((tasksDone / tasksTotal) * 100) : 0

      stats.value = {
        activeCount: counts.active ?? activeList.length,
        archivedCount: allCounts.archived ?? counts.archived ?? 0,
        referenceSpecCount: specCount,
        taskPct,
        tasksDone,
        tasksTotal
      }

      store.homeStats = {
        totalProjects: store.projects.length,
        activeChanges: stats.value.activeCount,
        archivedChanges: stats.value.archivedCount,
        referenceSpecs: stats.value.referenceSpecCount,
        tasksDone: stats.value.tasksDone,
        tasksTotal: stats.value.tasksTotal,
        taskPct: stats.value.taskPct
      }
    } catch (e) {
      error.value = e.message || '加载仪表台数据失败'
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    stats,
    activeChanges,
    recentActivity,
    hasProject,
    loadDashboard
  }
}
