<template>
  <div class="tasks-page-root">
    <ProjectTabsBar
      :tabs="projectTabs"
      :projects="projectList"
      :default-project-id="store.defaultProjectId || ''"
      :show-scroll-left="showTabScrollLeft"
      :show-scroll-right="showTabScrollRight"
      @manage="openProjectSelector"
      @pick-project="addProjectTab"
      @activate="activateTab"
      @close="closeTab"
      @scroll="scrollTabs"
    />

    <div class="main-container">
      <PrimarySidebar
        :collapsed="secondaryCollapsed"
        :active-nav="activePrimaryNav"
        @nav="primaryNav"
        @settings="goSettings"
        @toggle-collapse="toggleSecondary"
      />

      <SecondarySidebar
        :tasks="displayTasks"
        :viewing-task="viewingTask"
        :collapsed="secondaryCollapsed"
        :sort-by="sortBy"
        :mode="store.primaryNavMode"
        :search-query="store.searchQuery"
        :spec-files="displaySpecFiles"
        :viewing-spec-file="store.viewingSpecFile"
        :task-total="tasks.length"
        :spec-total="store.specFiles.length"
        @new-change="showToast('新建任务入口属 M3')"
        @toggle-sort="toggleSort"
        @refresh="refreshTasks"
        @select="handleOpenDetail"
        @search="setSearchQuery"
        @select-spec="handleOpenSpecFile"
      />

      <section class="content-area">
        <SpecContentPanel
          v-if="store.primaryNavMode === 'config'"
          :file="store.viewingSpecFile"
          :content="store.specFileContent"
          :loading="loadingSpecContent"
        />
        <TaskDetail
          v-else-if="viewingTask"
          :task="viewingTask"
          :active-tab="activeTab"
          :active-stage-nav="activeStageNav"
          :all-steps-done="allStepsDone"
          :current-group-name="currentGroupName"
          :refreshing-file-key="refreshingFileKey"
          :validating="validating"
          :validate-result="validateResult"
          :validate-error="validateError"
          @stage-nav="selectStageNav"
          @view-session="viewSession"
          @delete-session="deleteSession"
          @action="handleTaskAction"
          @tab-change="activeTab = $event"
          @refresh-file="handleRefreshFile"
          @revalidate="runValidate"
        />
        <div v-else class="content-area__empty">
          <p>暂无内容</p>
        </div>
      </section>
    </div>

    <ChangeDetailDrawer
      v-if="viewingTask"
      :visible="detailDrawerOpen"
      :task="viewingTask"
      @close="closeDetailDrawer"
    />

    <ProjectSelectorModal
      :visible="showProjectSelector"
      :projects="projectList"
      :active-id="activeProject.id"
      :default-project-id="store.defaultProjectId || ''"
      :removing-project-id="removingProjectId || ''"
      @close="showProjectSelector = false"
      @select="selectProject"
      @set-default="setDefaultProject"
      @add="openAddProject"
      @delete="removeProject"
    />

    <AddProjectModal
      :visible="showAddProject"
      :browse-path="browsePath"
      :dir-list="dirList"
      :current-path="currentBrowsePathStr"
      :has-openspec="hasOpenspecDir"
      :error="addError"
      :manual-path="manualPath"
      @close="showAddProject = false"
      @nav-root="navToRoot"
      @nav-breadcrumb="navToBreadcrumb"
      @enter-dir="enterDir"
      @confirm="confirmAddProject"
      @validate="validateManualPath"
    />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { store, showToast } from '../stores/index.js'
import { revealPath, fetchTaskPlanLint } from '../api/index.js'
import { resolveStageTab } from '../utils/workflow.js'
import { getDefaultDetailTabId, fileKey, fileDisplayName } from '../utils/changeFiles.js'
import { useTasks } from '../composables/useTasks.js'
import { useProjects } from '../composables/useProjects.js'
import ProjectTabsBar from '../components/tasks/ProjectTabsBar.vue'
import PrimarySidebar from '../components/tasks/PrimarySidebar.vue'
import SecondarySidebar from '../components/tasks/SecondarySidebar.vue'
import ProjectSelectorModal from '../components/tasks/ProjectSelectorModal.vue'
import AddProjectModal from '../components/tasks/AddProjectModal.vue'
import TaskDetail from '../components/TaskDetail.vue'
import SpecContentPanel from '../components/tasks/SpecContentPanel.vue'
import ChangeDetailDrawer from '../components/tasks/ChangeDetailDrawer.vue'

const router = useRouter()
const route = useRoute()

const {
  tasks,
  viewingTask,
  displayTasks,
  displaySpecFiles,
  sortBy,
  showTabScrollLeft,
  showTabScrollRight,
  allStepsDone,
  currentGroupName,
  activePrimaryNav,
  loadingSpecContent,
  loadProjectData,
  openDetail,
  refreshChangeFile,
  openConfigFile,
  refreshTasks,
  toggleSort,
  setSearchQuery,
  primaryNav
} = useTasks()

const {
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
  removingProjectId
} = useProjects(loadProjectData)

const activeTab = ref('')
const activeStageNav = ref('')
const detailDrawerOpen = ref(false)
const secondaryCollapsed = ref(false)
const refreshingFileKey = ref('')
const validating = ref(false)
const validateResult = ref(null)
const validateError = ref('')
/** 按「项目路径::变更名」缓存各变更最后一次检测结果 */
const validateCache = reactive({})

function getValidateCacheKey(task = viewingTask.value) {
  const projectPath = store.activeProject?.path
  const changeName = task?.name
  if (!projectPath || !changeName) return ''
  return `${projectPath}::${changeName}`
}

function loadCachedValidateState(task = viewingTask.value) {
  const key = getValidateCacheKey(task)
  if (!key || !validateCache[key]) {
    validateResult.value = null
    validateError.value = ''
    return false
  }
  const cached = validateCache[key]
  validateResult.value = cached.result ?? null
  validateError.value = cached.error ?? ''
  return true
}

function saveValidateCache(result, error, task = viewingTask.value) {
  const key = getValidateCacheKey(task)
  if (!key) return
  validateCache[key] = { result: result ?? null, error: error ?? '' }
}

function closeDetailDrawer() {
  detailDrawerOpen.value = false
  if (activeStageNav.value === 'info') {
    activeStageNav.value = ''
  }
}

function toggleSecondary() {
  secondaryCollapsed.value = !secondaryCollapsed.value
  store.secondaryCollapsed = secondaryCollapsed.value
}

function goSettings() {
  router.push('/config')
}

function selectStageNav(id) {
  if (id === 'info') {
    detailDrawerOpen.value = !detailDrawerOpen.value
    activeStageNav.value = detailDrawerOpen.value ? 'info' : ''
    return
  }

  if (id === 'review') {
    closeDetailDrawer()
    activeStageNav.value = activeStageNav.value === 'review' ? '' : 'review'
    return
  }

  if (id === 'conversation') {
    closeDetailDrawer()
    const opening = activeStageNav.value !== 'conversation'
    activeStageNav.value = opening ? 'conversation' : ''
    if (opening && viewingTask.value) {
      const hasCache = loadCachedValidateState()
      if (!hasCache) {
        runValidate()
      }
    }
    return
  }

  closeDetailDrawer()
  activeStageNav.value = id
  const tabId = resolveStageTab(viewingTask.value, id)
  if (tabId) {
    activeTab.value = tabId
    return
  }
  showToast(`${id} 视图（Demo 占位）`)
}

/**
 * 校验计划（只读）。
 *
 * 走 `GET /api/tasks/:id/plan-lint` → 后端转调 CLI 的 `tasks-lint`，不改任何文件。
 * 计划文件由产物表声明，前端只需把 `kind` 带上让后端定位，不自己拼路径。
 */
async function runValidate() {
  const task = viewingTask.value
  if (!task) return

  validating.value = true
  validateError.value = ''
  const { data, error } = await fetchTaskPlanLint(store.activeProject, task.name, task.kind)
  validating.value = false

  if (error) {
    validateResult.value = null
    validateError.value = error
    saveValidateCache(null, error, task)
    return
  }

  validateResult.value = data
  saveValidateCache(data, '', task)

  if (data.pass === null) {
    showToast(`未校验：${data.reason || '无可校验文件'}`)
  } else if (data.pass) {
    showToast('计划校验通过')
  } else {
    showToast(`计划校验：${(data.violations || []).length} 项未通过`)
  }
}

async function viewSession() {
  await handleTaskAction('打开变更')
}

function deleteSession() {
  showToast('删除变更')
}

async function handleRefreshFile(file) {
  if (!file || refreshingFileKey.value) return
  const key = fileKey(file)
  refreshingFileKey.value = key
  const result = await refreshChangeFile(file)
  refreshingFileKey.value = ''
  if (result?.error) {
    showToast('刷新失败: ' + result.error)
    return
  }
  showToast(`${fileDisplayName(file)} 已刷新`)
}

async function handleOpenDetail(task) {
  const result = await openDetail(task)
  activeTab.value = getDefaultDetailTabId(viewingTask.value?.workflowPhases) || ''
  detailDrawerOpen.value = false
  activeStageNav.value = ''
  if (result?.error) return
}

async function handleOpenSpecFile(file) {
  await openConfigFile(file)
}

async function handleTaskAction(action) {
  if (action && typeof action === 'object' && action.code) {
    // 步骤操作（operations）端点在 M2 移除，操作白名单属 M3；M3 的写操作走
    // 各自的显式入口（阶段推进 / 交付清理），不从这个通用回调进。
    showToast(`操作: ${action.name}（暂无可用操作）`)
    return
  }
  if (action === '打开变更') {
    const task = viewingTask.value
    const changePath = task?.changePath
      || (store.activeProject?.path && task?.name
        ? `${store.activeProject.path}/openspec/changes/${task.name}`
        : '')
    if (!changePath) {
      showToast('请先选择项目和变更')
      return
    }
    const { error } = await revealPath(changePath)
    if (error) {
      showToast('打开目录失败: ' + error)
    }
    return
  }
  showToast(String(action || '未知操作'))
}

onMounted(async () => {
  await loadProjects()
  if (store.activeProject) {
    await loadProjectData(store.activeProject)
    const changeName = route.query.change
    if (changeName) {
      const task = tasks.find((t) => t.name === changeName)
      if (task) await openDetail(task)
    }
  }
})
</script>

<style scoped>
.content-area__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-helper);
  font-size: 14px;
}
</style>
