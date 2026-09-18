import { reactive } from 'vue'

export const store = reactive({
  theme: 'dark',
  loading: false,
  projects: [],
  currentProject: null,
  currentProjectId: localStorage.getItem('polaris-current-project-id') || null,
  defaultProjectId: localStorage.getItem('polaris-default-project-id') || null,
  activeProject: null,
  tasks: [],
  taskCounts: { active: 0, archived: 0 },
  taskFilter: 'active',
  currentTask: null,
  primaryNavMode: 'tasks',
  searchQuery: '',
  specFiles: [],
  viewingSpecFile: null,
  specFileContent: null,
  checkResults: null,
  homeStats: {
    totalProjects: 0,
    activeChanges: 0,
    archivedChanges: 0,
    referenceSpecs: 0,
    tasksDone: 0,
    tasksTotal: 0,
    taskPct: 0
  },
  statusMessage: '就绪',
  projectTabs: [],
  secondaryCollapsed: false,
  toast: { show: false, message: '' }
})

let toastTimer = null

export function showToast(message) {
  store.toast.message = message
  store.toast.show = true
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    store.toast.show = false
  }, 2500)
}

export function setCurrentProject(project) {
  store.currentProject = project
  store.activeProject = project
  store.currentProjectId = project ? project.id : null
  if (project) {
    localStorage.setItem('polaris-current-project-id', project.id)
  } else {
    localStorage.removeItem('polaris-current-project-id')
  }
}

export function setDefaultProjectId(id) {
  store.defaultProjectId = id
  if (id) {
    localStorage.setItem('polaris-default-project-id', id)
  } else {
    localStorage.removeItem('polaris-default-project-id')
  }
}

export function restoreCurrentProject() {
  const pick = (id) => id && store.projects.find(p => p.id === id)

  const defaultProj = pick(store.defaultProjectId)
  if (defaultProj) {
    store.currentProject = defaultProj
    store.activeProject = defaultProj
    store.currentProjectId = defaultProj.id
    localStorage.setItem('polaris-current-project-id', defaultProj.id)
    return true
  }

  const lastProj = pick(store.currentProjectId)
  if (lastProj) {
    store.currentProject = lastProj
    store.activeProject = lastProj
    return true
  }

  if (store.projects.length > 0) {
    store.currentProject = store.projects[0]
    store.activeProject = store.projects[0]
    store.currentProjectId = store.projects[0].id
    localStorage.setItem('polaris-current-project-id', store.projects[0].id)
    return true
  }
  return false
}
