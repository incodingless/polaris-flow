import { ref, computed } from 'vue'
import { store } from '../stores/index.js'
import { fetchTasks, fetchConfigs, fetchStats } from '../api/index.js'
import { mapChangeToTask } from '../utils/changeMapper.js'
import {
  getChangeProgressPct,
  getSpecDeltaCount,
  formatChangeTitle,
  formatTimestamp,
  formatTaskStats,
  getCompletedPhaseBadges
} from '../utils/dashboardHelpers.js'

/** 仪表台数据：统计卡片、活动任务、最近活动 */
export function useDashboard() {
  const loading = ref(false)
  const error = ref('')
  const activeChanges = ref([])
  const recentActivity = ref([])
  const stats = ref({
    activeCount: 0,
    archivedCount: 0,
    configCount: 0,
    taskPct: 0,
    tasksDone: 0,
    tasksTotal: 0,
    byKind: {}
  })

  const hasProject = computed(() => !!store.activeProject?.path)

  /** 将 API 任务项映射为仪表台卡片结构（一律使用映射后的结构，避免两套字段名） */
  function mapToDashboardChange(raw, index, projectPath) {
    const task = mapChangeToTask(raw, index, projectPath)
    return {
      id: task.id,
      title: formatChangeTitle(task),
      name: task.name,
      kind: task.kind,
      kindLabel: task.kindLabel,
      groupTag: task.groupTag,
      badges: getCompletedPhaseBadges(task),
      updatedAt: formatTimestamp(task.time),
      specDeltas: getSpecDeltaCount(task),
      taskStats: formatTaskStats(task),
      progressPct: getChangeProgressPct(task),
      phase: task.phase,
      phaseLabel: task.phaseLabel,
      status: task.status,
      statusType: task.statusType,
      raw
    }
  }

  /** 配置文件数量（`.polaris/*.yaml`；旧的「参考规范」取自 openspec/specs，M2 已换源） */
  async function loadConfigCount(project) {
    const { data, error: cfgErr } = await fetchConfigs(project)
    if (cfgErr || !Array.isArray(data)) return 0
    return data.length
  }

  function emptyStats() {
    return {
      activeCount: 0,
      archivedCount: 0,
      configCount: 0,
      taskPct: 0,
      tasksDone: 0,
      tasksTotal: 0,
      byKind: {}
    }
  }

  /** 加载仪表台全量数据 */
  async function loadDashboard() {
    const project = store.activeProject
    if (!project?.path) {
      activeChanges.value = []
      recentActivity.value = []
      stats.value = emptyStats()
      return
    }

    loading.value = true
    error.value = ''

    try {
      const [activeRes, allRes, configCount, statsRes] = await Promise.all([
        fetchTasks(project, { status: 'active' }),
        fetchTasks(project, { status: 'all' }),
        loadConfigCount(project),
        fetchStats(project).catch(() => null)
      ])

      if (activeRes.error) {
        error.value = activeRes.error
        return
      }

      const projectPath = project.path
      const activeList = (activeRes.data?.tasks || []).map((t, i) =>
        mapToDashboardChange(t, i, projectPath)
      )
      activeChanges.value = activeList

      const allTasks = allRes.data?.tasks || []
      const sorted = [...allTasks].sort(
        (a, b) => new Date(b.updated_at || b.started_at || 0) - new Date(a.updated_at || a.started_at || 0)
      )
      recentActivity.value = sorted.slice(0, 12).map((t, i) => mapToDashboardChange(t, i, projectPath))

      const counts = activeRes.data?.counts || {}
      const allCounts = allRes.data?.counts || {}

      let tasksDone = 0
      let tasksTotal = 0
      // 优先用 /api/stats 的聚合（它按项目汇总，避免前端再遍历一遍）
      const agg = statsRes && !statsRes.error ? statsRes.data : null
      if (agg) {
        tasksDone = agg.tasks_done ?? 0
        tasksTotal = agg.tasks_total ?? 0
      } else {
        for (const t of allTasks) {
          if (t.tasks_done !== null && t.tasks_done !== undefined) {
            tasksDone += t.tasks_done
            tasksTotal += t.tasks_total ?? 0
          }
        }
      }

      const taskPct = tasksTotal ? Math.round((tasksDone / tasksTotal) * 100) : 0

      stats.value = {
        activeCount: counts.active ?? activeList.length,
        archivedCount: allCounts.archived ?? counts.archived ?? 0,
        configCount,
        taskPct,
        tasksDone,
        tasksTotal,
        byKind: counts.by_kind ?? {}
      }

      store.homeStats = {
        totalProjects: store.projects.length,
        activeChanges: stats.value.activeCount,
        archivedChanges: stats.value.archivedCount,
        configCount: stats.value.configCount,
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
