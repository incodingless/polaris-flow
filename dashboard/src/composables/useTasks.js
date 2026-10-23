import { reactive, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { store, showToast } from '../stores/index.js'
import {
  fetchTasks,
  fetchTaskDetail,
  fetchConfigs,
  fetchConfigContent
} from '../api/index.js'
import { mapChangeToTask, mapChangeDetail } from '../utils/changeMapper.js'
import { fileKey, fileDisplayName } from '../utils/changeFiles.js'

/** 任务页数据：任务列表与详情加载 */
export function useTasks() {
  const router = useRouter()
  const tasks = reactive([])
  const viewingTask = ref(null)
  const sortBy = ref('time')
  const loadingTasks = ref(false)
  const switchingProject = ref(false)
  const showTabScrollLeft = ref(false)
  const showTabScrollRight = ref(false)
  const loadingSpecs = ref(false)
  const loadingSpecContent = ref(false)

  const allStepsDone = computed(() => {
    const t = viewingTask.value
    if (!t) return false
    if (t.phase === 'archived') return true
    const groups = t.stepGroups
    return groups?.length > 0 && groups.every((g) => g.status === 'completed')
  })

  const currentGroupName = computed(() => {
    const t = viewingTask.value
    if (!t || allStepsDone.value) return ''
    const active = t.stepGroups?.find((g) => g.status === 'active')
    return active ? active.name : (t.currentGroup || '')
  })

  /** 按关键词过滤任务列表 */
  const filteredTasks = computed(() => {
    const q = (store.searchQuery || '').trim().toLowerCase()
    if (!q) return tasks
    return tasks.filter((t) => {
      const haystack = [t.name, t.title, ...(Array.isArray(t.labels) ? t.labels : [])]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  })

  /** 按关键词过滤配置文件列表 */
  const filteredSpecFiles = computed(() => {
    const q = (store.searchQuery || '').trim().toLowerCase()
    if (!q) return store.specFiles
    return store.specFiles.filter((f) => {
      const haystack = [f.name, f.path].join(' ').toLowerCase()
      return haystack.includes(q)
    })
  })

  const displayTasks = computed(() => filteredTasks.value)
  const displaySpecFiles = computed(() => filteredSpecFiles.value)

  function sortTaskList(list) {
    const sorted = [...list]
    if (sortBy.value === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name))
    } else {
      sorted.sort((a, b) => new Date(b.time) - new Date(a.time))
    }
    return sorted
  }

  /** 配置文件列表排序（按名称或修改时间） */
  function sortSpecFileList(list) {
    const sorted = [...list]
    if (sortBy.value === 'name') {
      sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    } else {
      sorted.sort((a, b) => new Date(b.mtime || 0) - new Date(a.mtime || 0))
    }
    return sorted
  }

  function applyTaskList(rawTasks, counts) {
    const projectPath = store.activeProject?.path || ''
    const mapped = rawTasks.map((task, index) => mapChangeToTask(task, index, projectPath))
    const sorted = sortTaskList(mapped)
    tasks.splice(0, tasks.length, ...sorted)
    store.tasks = tasks
    store.taskCounts = {
      active: counts?.active ?? 0,
      archived: counts?.archived ?? 0,
      byKind: counts?.by_kind ?? {}
    }
    return sorted
  }

  /**
   * 加载指定项目的任务列表，并自动选中第一项详情。
   * @param {object} project
   * @param {'active'|'archived'|'all'} status
   */
  async function loadProjectData(project, status = store.taskFilter, options = {}) {
    const { autoSelectFirst = true } = options
    if (!project?.path) {
      tasks.splice(0, tasks.length)
      viewingTask.value = null
      store.currentTask = null
      return { ok: true }
    }

    store.taskFilter = status
    switchingProject.value = true
    loadingTasks.value = true
    store.loading = true
    store.statusMessage = status === 'archived' ? '加载归档列表...' : '加载任务列表...'

    const { data, error } = await fetchTasks(project, { status })

    loadingTasks.value = false
    store.loading = false

    if (error) {
      switchingProject.value = false
      store.statusMessage = '加载失败'
      return { error }
    }

    const sorted = applyTaskList(data.tasks || [], data.counts)
    store.statusMessage = '就绪'

    if (autoSelectFirst && sorted.length > 0) {
      const detailResult = await openDetail(sorted[0], project)
      switchingProject.value = false
      if (detailResult?.error) return { error: detailResult.error }
      return { ok: true }
    }

    viewingTask.value = null
    store.currentTask = null
    switchingProject.value = false
    return { ok: true }
  }

  /** 打开任务详情 */
  async function openDetail(task, project = store.activeProject) {
    if (!task?.name || !project?.path) return { error: '无效的任务或项目' }

    store.primaryNavMode = store.primaryNavMode === 'config' ? 'config' : 'tasks'
    store.statusMessage = '加载任务详情...'

    const { data, error } = await fetchTaskDetail(project, task.name, task.kind)
    if (error) {
      store.statusMessage = '就绪'
      showToast('加载任务详情失败: ' + error)
      return { error }
    }

    const index = tasks.findIndex((t) => t.name === task.name)
    const mapped = mapChangeDetail(data, index >= 0 ? index : 0, project?.path || '')

    store.statusMessage = '就绪'
    viewingTask.value = mapped
    store.currentTask = mapped
    if (index >= 0) {
      Object.assign(tasks[index], {
        currentGroup: mapped.currentGroup,
        currentStepStatus: mapped.currentStepStatus,
        stepGroups: mapped.stepGroups,
        changePath: mapped.changePath
      })
    }
    return { ok: true }
  }

  /** 重新加载单个任务文件内容 */
  async function refreshChangeFile(file, project = store.activeProject, task = viewingTask.value) {
    if (!file || !task?.name || !project?.path) {
      return { error: '无效的文件或项目' }
    }

    const targetKey = fileKey(file)
    const { data, error } = await fetchTaskDetail(project, task.name, task.kind)
    if (error) return { error }

    const remoteFile = [...(data.files || []), ...(data.specFiles || [])].find(
      (item) => fileKey(item) === targetKey
    )
    if (!remoteFile) {
      return { error: '文件未找到' }
    }

    const current = viewingTask.value
    if (!current) return { error: '无当前任务' }

    function patchFileList(list = []) {
      const index = list.findIndex((item) => fileKey(item) === targetKey)
      if (index < 0) return false
      Object.assign(list[index], {
        name: remoteFile.name,
        path: remoteFile.path,
        content: remoteFile.content
      })
      return true
    }

    if (!patchFileList(current.files) && !patchFileList(current.specFiles)) {
      return { error: '文件未找到' }
    }

    return { ok: true }
  }

  /** 加载配置文件列表（`.polaris/*.yaml`；后端已按此过滤，前端不再筛路径前缀） */
  async function loadConfigFiles(project = store.activeProject) {
    if (!project?.path) {
      showToast('请先选择项目')
      return { error: '无项目' }
    }

    loadingSpecs.value = true
    store.statusMessage = '加载配置文件...'
    const { data, error } = await fetchConfigs(project)
    loadingSpecs.value = false
    store.statusMessage = '就绪'

    if (error) {
      showToast('加载配置失败: ' + error)
      return { error }
    }

    const configs = sortSpecFileList(data)
    store.specFiles.splice(0, store.specFiles.length, ...configs)
    store.viewingSpecFile = null
    store.specFileContent = null
    viewingTask.value = null
    store.currentTask = null

    if (configs.length > 0) {
      await openConfigFile(configs[0], project)
    }
    return { ok: true }
  }

  /** 打开配置文件内容 */
  async function openConfigFile(file, project = store.activeProject) {
    if (!file?.path || !project?.path) return { error: '无效的文件或项目' }

    store.viewingSpecFile = file
    loadingSpecContent.value = true
    const { data, error } = await fetchConfigContent(project, file.path)
    loadingSpecContent.value = false

    if (error) {
      showToast('加载文件失败: ' + error)
      return { error }
    }

    store.specFileContent = data.content || ''
    return { ok: true }
  }

  async function refreshTasks() {
    if (!store.activeProject) {
      showToast('请先选择项目')
      return
    }
    if (store.primaryNavMode === 'config') {
      const result = await loadConfigFiles()
      if (!result?.error) showToast('配置列表已刷新')
      store.statusMessage = '配置列表已刷新'
      return
    }
    const result = await loadProjectData(store.activeProject, store.taskFilter)
    if (result?.error) {
      showToast('刷新失败: ' + result.error)
    } else {
      showToast('任务列表已刷新')
    }
    store.statusMessage = '任务列表已刷新'
  }

  function toggleSort() {
    sortBy.value = sortBy.value === 'time' ? 'name' : 'time'
    if (tasks.length > 0) {
      const sorted = sortTaskList([...tasks])
      tasks.splice(0, tasks.length, ...sorted)
    }
    if (store.specFiles.length > 0) {
      const sorted = sortSpecFileList([...store.specFiles])
      store.specFiles.splice(0, store.specFiles.length, ...sorted)
    }
  }

  function setSearchQuery(query) {
    store.searchQuery = query
  }

  /** 一级导航切换 */
  async function primaryNav(target) {
    if (!store.activeProject && target !== 'check') {
      showToast('请先选择项目')
      return
    }

    if (target === 'tasks') {
      store.primaryNavMode = 'tasks'
      store.searchQuery = ''
      const result = await loadProjectData(store.activeProject, 'active')
      if (result?.error) showToast('加载任务列表失败: ' + result.error)
      return
    }

    if (target === 'archive') {
      store.primaryNavMode = 'tasks'
      store.searchQuery = ''
      const result = await loadProjectData(store.activeProject, 'archived')
      if (result?.error) showToast('加载归档列表失败: ' + result.error)
      return
    }

    if (target === 'config') {
      store.primaryNavMode = 'config'
      store.searchQuery = ''
      const result = await loadConfigFiles()
      if (result?.error) showToast('加载配置失败: ' + result.error)
      return
    }

    if (target === 'check') {
      router.push('/check')
    }
  }

  const activePrimaryNav = computed(() => {
    if (store.primaryNavMode === 'config') return 'config'
    if (store.taskFilter === 'archived') return 'archive'
    return 'tasks'
  })

  return {
    tasks,
    displayTasks,
    displaySpecFiles,
    viewingTask,
    sortBy,
    loadingTasks,
    loadingSpecs,
    loadingSpecContent,
    switchingProject,
    showTabScrollLeft,
    showTabScrollRight,
    allStepsDone,
    currentGroupName,
    activePrimaryNav,
    loadProjectData,
    openDetail,
    refreshChangeFile,
    openConfigFile,
    loadConfigFiles,
    refreshTasks,
    toggleSort,
    setSearchQuery,
    primaryNav
  }
}
