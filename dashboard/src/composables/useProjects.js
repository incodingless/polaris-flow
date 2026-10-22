import { reactive, ref, computed } from 'vue'
import { store, showToast, setCurrentProject, restoreCurrentProject, setDefaultProjectId } from '../stores/index.js'
import { fetchProjects, addProject, deleteProject, fetchDir, fetchCheckInitialized, setDefaultProject as setDefaultProjectApi } from '../api/index.js'

/** 从绝对路径解析面包屑分段 */
function pathSegments(absPath) {
  if (!absPath || absPath === '/') return []
  return absPath.split('/').filter(Boolean)
}

/** 从绝对路径取目录名作为默认项目别名 */
function dirBasename(absPath) {
  const segs = pathSegments(absPath)
  return segs.length ? segs[segs.length - 1] : absPath
}

/** 根据分段索引拼接绝对路径 */
function pathUpToSegment(absPath, segIndex) {
  const segs = pathSegments(absPath)
  if (segIndex < 0) return '/'
  return '/' + segs.slice(0, segIndex + 1).join('/')
}

export function useProjects(onProjectSwitch) {
  const projectTabs = reactive([])
  const showProjectSelector = ref(false)
  const showAddProject = ref(false)
  const currentDir = ref('/')
  const dirList = reactive([])
  const hasOpenspecDir = ref(false)
  const addError = ref('')
  const manualPath = ref('')
  const loadingDirs = ref(false)
  const loadingProjects = ref(false)
  const removingProjectId = ref(null)

  let projectSwitchHandler = onProjectSwitch || null
  let switching = false

  const projectList = computed(() => {
    const list = [...store.projects]
    const defaultId = store.defaultProjectId
    list.sort((a, b) => {
      if (a.id === defaultId) return -1
      if (b.id === defaultId) return 1
      return a.name.localeCompare(b.name)
    })
    return list
  })
  const activeProject = computed(() => store.activeProject || { id: '', name: '', path: '' })
  const browsePath = computed(() => pathSegments(currentDir.value))
  const currentBrowsePathStr = computed(() => currentDir.value)

  function setProjectSwitchHandler(fn) {
    projectSwitchHandler = fn
  }

  /** 将 API 项目同步为标签栏条目 */
  function projectToTab(project, active = false) {
    return {
      id: project.id,
      name: project.name,
      active,
      loading: false
    }
  }

  /** 回滚标签激活态到指定项目 */
  function rollbackTabs(previousProject) {
    if (!previousProject) return
    projectTabs.forEach((t) => {
      t.active = t.id === previousProject.id
      t.loading = false
    })
    setCurrentProject(previousProject)
    store.projectTabs = projectTabs
  }

  /** 统一项目切换：更新标签、store，并触发数据加载回调 */
  async function switchToProject(project, tab, { silent = false } = {}) {
    if (!project) return { error: '项目不存在' }
    if (switching) return { error: '正在切换项目，请稍候' }

    const previousProject = store.activeProject
    if (previousProject?.id === project.id && tab?.active) {
      return { ok: true }
    }

    let activeTab = tab
    if (!activeTab) {
      activeTab = projectTabs.find((t) => t.id === project.id)
      if (!activeTab) {
        activeTab = projectToTab(project, false)
        projectTabs.push(activeTab)
      }
    }

    switching = true
    projectTabs.forEach((t) => { t.active = false })
    activeTab.active = true
    activeTab.loading = true
    setCurrentProject(project)
    store.projectTabs = projectTabs

    if (!projectSwitchHandler) {
      activeTab.loading = false
      switching = false
      if (!silent) showToast(`已切换到项目: ${project.name}`)
      return { ok: true }
    }

    try {
      const result = await projectSwitchHandler(project)
      if (result?.error) {
        rollbackTabs(previousProject)
        showToast('切换项目失败: ' + result.error)
        return { error: result.error }
      }
      if (!silent) showToast(`已切换到项目: ${project.name}`)
      return { ok: true }
    } catch (e) {
      rollbackTabs(previousProject)
      const message = e?.message || '未知错误'
      showToast('切换项目失败: ' + message)
      return { error: message }
    } finally {
      activeTab.loading = false
      switching = false
    }
  }

  /** 确保标签存在并激活（含数据加载） */
  async function ensureTabActive(project, options = {}) {
    return switchToProject(project, null, options)
  }

  /** 加载项目列表并恢复上次选中的项目 */
  async function loadProjects() {
    loadingProjects.value = true
    const { data, error } = await fetchProjects()
    loadingProjects.value = false

    if (error) {
      showToast('加载项目列表失败: ' + error)
      return
    }

    store.projects = data?.projects || []
    store.defaultProjectId = data?.defaultProjectId ?? null
    setDefaultProjectId(store.defaultProjectId)
    store.homeStats.totalProjects = store.projects.length

    if (store.projects.length === 0) {
      projectTabs.splice(0, projectTabs.length)
      setCurrentProject(null)
      return
    }

    restoreCurrentProject()
    const current = store.activeProject
    if (current) {
      projectTabs.splice(0, projectTabs.length, projectToTab(current, true))
      store.projectTabs = projectTabs
    }
  }

  /** 拉取目录列表并检测 openspec 子目录 */
  async function loadDir(parentDir) {
    loadingDirs.value = true
    addError.value = ''
    const { data, error } = await fetchDir(parentDir)

    if (error) {
      loadingDirs.value = false
      addError.value = error
      dirList.splice(0, dirList.length)
      hasOpenspecDir.value = false
      return false
    }

    dirList.splice(0, dirList.length, ...data)

    const { data: checkData, error: checkError } = await fetchCheckInitialized(parentDir)
    loadingDirs.value = false
    hasOpenspecDir.value = !checkError && checkData?.exists === true
    return true
  }

  function openProjectSelector() {
    showProjectSelector.value = true
  }

  async function selectProject(proj) {
    if (proj.id === activeProject.value.id) {
      showProjectSelector.value = false
      return
    }
    showProjectSelector.value = false
    await ensureTabActive(proj)
  }

  /** 从下拉列表添加项目标签并激活 */
  async function addProjectTab(proj) {
    if (!proj?.id) return
    const existingTab = projectTabs.find((t) => t.id === proj.id)
    if (existingTab?.active) return
    await switchToProject(proj, existingTab || null)
  }

  /** 设为默认项目（全局互斥，持久化到服务端） */
  async function setDefaultProject(proj) {
    if (!proj?.id) return
    if (proj.id === store.defaultProjectId) return

    const { data, error } = await setDefaultProjectApi(proj.id)
    if (error) {
      showToast('设置默认项目失败: ' + error)
      return
    }

    store.defaultProjectId = data.defaultProjectId ?? proj.id
    setDefaultProjectId(store.defaultProjectId)
    showToast(`已将「${proj.name}」设为默认项目`)
  }

  async function openAddProject() {
    showProjectSelector.value = false
    showAddProject.value = true
    addError.value = ''
    manualPath.value = ''
    currentDir.value = '/'
    await loadDir('/')
  }

  async function navToRoot() {
    currentDir.value = '/'
    await loadDir('/')
  }

  async function navToBreadcrumb(segIndex) {
    const target = pathUpToSegment(currentDir.value, segIndex)
    currentDir.value = target
    await loadDir(target)
  }

  async function enterDir(dir) {
    currentDir.value = dir.path
    await loadDir(dir.path)
  }

  async function confirmAddProject() {
    if (!hasOpenspecDir.value) return

    const path = currentDir.value
    const name = dirBasename(path)
    addError.value = ''

    const { data: project, error } = await addProject(name, path)
    if (error) {
      addError.value = error
      return
    }

    const exists = store.projects.find((p) => p.id === project.id)
    if (!exists) {
      store.projects.push(project)
      store.homeStats.totalProjects = store.projects.length
    }

    if (!store.defaultProjectId) {
      store.defaultProjectId = project.id
      setDefaultProjectId(project.id)
    }

    showAddProject.value = false
    showProjectSelector.value = true
    showToast('项目添加成功')
  }

  async function validateManualPath(pathInput) {
    const trimmed = (pathInput || manualPath.value).trim()
    if (!trimmed) return

    manualPath.value = trimmed
    currentDir.value = trimmed
    const ok = await loadDir(trimmed)
    if (ok) {
      showToast('路径验证通过: ' + trimmed)
    }
  }

  /** 从注册表移除项目（不删除磁盘目录） */
  async function removeProject(proj) {
    if (!proj?.id) return

    removingProjectId.value = proj.id
    const wasActive = store.activeProject?.id === proj.id

    try {
      const { error } = await deleteProject(proj.id)
      if (error) {
        showToast('移除项目失败: ' + error)
        return
      }

      const { data, error: fetchError } = await fetchProjects()
      if (fetchError) {
        store.projects = store.projects.filter((p) => p.id !== proj.id)
        showToast('项目已移除，但刷新列表失败: ' + fetchError)
      } else {
        store.projects = data?.projects || []
        store.defaultProjectId = data?.defaultProjectId ?? null
        setDefaultProjectId(store.defaultProjectId)
        store.homeStats.totalProjects = store.projects.length
      }

      const tabIdx = projectTabs.findIndex((t) => t.id === proj.id)
      if (tabIdx !== -1) projectTabs.splice(tabIdx, 1)

      if (wasActive) {
        if (store.projects.length === 0) {
          setCurrentProject(null)
          store.projectTabs = []
          store.tasks = []
          store.taskCounts = { active: 0, archived: 0 }
          store.currentTask = null
        } else {
          const next = store.projects.find((p) => p.id === store.defaultProjectId)
            || store.projects[0]
          await switchToProject(next, null, { silent: true })
        }
      } else {
        store.projectTabs = projectTabs
      }

      showToast(`已移除项目: ${proj.name}`)
    } finally {
      removingProjectId.value = null
    }
  }

  async function activateTab(tab) {
    if (tab.active) return
    if (tab.deleted) {
      showToast('该项目已不存在，请关闭标签后重新添加')
      return
    }
    const project = store.projects.find((p) => p.id === tab.id)
    if (!project) {
      showToast('该项目已不存在，请关闭标签后重新添加')
      return
    }
    await switchToProject(project, tab)
  }

  async function closeTab(tab, i) {
    if (projectTabs.length === 1) {
      showToast('已关闭所有项目标签')
      return
    }
    const wasActive = tab.active
    projectTabs.splice(i, 1)
    if (wasActive) {
      const newActiveTab = projectTabs[Math.min(i, projectTabs.length - 1)]
      const project = store.projects.find((p) => p.id === newActiveTab.id)
      if (project) {
        await switchToProject(project, newActiveTab, { silent: true })
      }
    }
    showToast(`已关闭标签: ${tab.name}`)
  }

  function scrollTabs() {
    /* 占位：标签溢出滚动 */
  }

  return {
    activeProject,
    projectTabs,
    showProjectSelector,
    showAddProject,
    projectList,
    browsePath,
    dirList,
    addError,
    manualPath,
    currentBrowsePathStr,
    hasOpenspecDir,
    loadingDirs,
    loadingProjects,
    removingProjectId,
    loadProjects,
    activateTab,
    closeTab,
    scrollTabs,
    openProjectSelector,
    selectProject,
    addProjectTab,
    setDefaultProject,
    openAddProject,
    navToRoot,
    navToBreadcrumb,
    enterDir,
    confirmAddProject,
    validateManualPath,
    removeProject,
    setProjectSwitchHandler,
    switchToProject
  }
}
