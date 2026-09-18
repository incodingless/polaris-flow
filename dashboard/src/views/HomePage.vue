<template>
  <div class="dashboard-page page">
    <!-- 页面头部 -->
    <header class="dashboard-header">
      <div class="dashboard-header__project" @click="openProjectSelector">
        <svg t="1781336428165" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="6753" width="24" height="24">
          <path d="M398.575 565.67H123.21c-33 0-60 27-60 60v273.735c0 33 27 60 60 60h275.364c33 0 60-27 60-60V625.67c0.001-33-26.999-60-59.999-60z m0 333.628a0.901 0.901 0 0 1-0.107 0.107h-275.15a0.901 0.901 0 0 1-0.107-0.107v-273.52a0.901 0.901 0 0 1 0.107-0.107h275.149v-0.001c0.037 0.031 0.076 0.07 0.108 0.108v273.52zM899.21 63.801H623.772c-33 0-60 27-60 60v273.735c0 33 27 60 60 60H899.21c33 0 60-27 60-60V123.801c0-33-27-60-60-60z m0.001 333.628a0.901 0.901 0 0 1-0.107 0.107H623.88a0.901 0.901 0 0 1-0.107-0.107v-273.52a0.901 0.901 0 0 1 0.107-0.107h275.223v-0.001c0.037 0.031 0.076 0.07 0.108 0.108v273.52zM398.649 63.801H123.21c-33 0-60 27-60 60v273.735c0 33 27 60 60 60h275.438c33 0 60-27 60-60V123.801c0.001-33-26.999-60-59.999-60z m0 333.628a0.901 0.901 0 0 1-0.107 0.107H123.318a0.901 0.901 0 0 1-0.107-0.107v-273.52a0.901 0.901 0 0 1 0.107-0.107h275.223v-0.001c0.037 0.031 0.076 0.07 0.108 0.108v273.52zM899.21 565.976h-274c-33 0-60 26.988-60 59.973v273.879c0 32.985 27 59.973 60 59.973h180c16.5 0 30-13.494 30-29.987s-13.5-29.987-30-29.987h-180V625.949h274v182.919c0 16.493 13.5 29.987 30 29.987s30-13.494 30-29.987V625.949c0-32.985-27-59.973-60-59.973z" fill="#707070" p-id="6754"></path>
        </svg>
        <h1 class="dashboard-header__title">
          Polaris 仪表台
        </h1>
      </div>
      <div class="dashboard-header__versions">
        <span class="dashboard-header__version">Polaris WebUI v0.3.5</span>
        <span class="dashboard-header__version-sep">·</span>
        <span class="dashboard-header__version">Polaris CLI v1.4.1</span>
        <span class="dashboard-header__version-sep">·</span>
        <span class="dashboard-header__version">Polaris CLI v1.4.1</span>
      </div>
    </header>

    <!-- 加载态 -->
    <div v-if="loading" class="dashboard-skeleton">
      <div class="dashboard-stats-grid">
        <div v-for="i in 4" :key="i" class="skeleton dashboard-skeleton__stat" />
      </div>
      <div class="skeleton dashboard-skeleton__section" />
    </div>

    <!-- 错误态 -->
    <div v-else-if="error" class="empty-state">
      <p class="empty-state__text">{{ error }}</p>
      <button type="button" class="btn btn-primary" @click="refresh">重试</button>
    </div>

    <!-- 无项目 -->
    <div v-else-if="!hasProject" class="empty-state">
      <p class="empty-state__text">请先添加并选择项目</p>
      <button type="button" class="btn btn-primary" @click="openProjectSelector">选择项目</button>
    </div>

    <!-- 主内容 -->
    <template v-else>
      <!-- 统计卡片 -->
      <section class="dashboard-stats-grid" aria-label="全局核心指标">
        <DashboardStatCard
          icon="active"
          title-en="Active Changes"
          title-cn="活动变更"
          title-stacked
          :value="stats.activeCount"
          hint="当前正在进行的工作"
        />
        <DashboardStatCard
          icon="archive"
          title-en="Archive"
          title-cn="归档"
          :value="stats.archivedCount"
          hint="已完成、可随时回看的工作"
        />
        <DashboardStatCard
          icon="specs"
          title-en="Specs"
          title-cn="参考规范"
          :value="stats.referenceSpecCount"
          hint="参考规范"
        />
        <DashboardStatCard
          variant="tasks"
          icon="tasks"
          title-en="Tasks"
          title-cn="任务"
          :task-pct="stats.taskPct"
          :tasks-done="stats.tasksDone"
          :tasks-total="stats.tasksTotal"
        />
      </section>

      <!-- 活动变更 -->
      <section class="dashboard-section">
        <div class="dashboard-section__head">
          <h2 class="dashboard-section__title">活动变更</h2>
          <span class="dashboard-section__subtitle">活动变更</span>
          <button type="button" class="btn dashboard-section__refresh" @click="refresh">刷新</button>
        </div>

        <div v-if="activeChanges.length === 0" class="empty-state dashboard-section__empty">
          <p class="empty-state__text">暂无进行中的变更</p>
          <router-link to="/tasks" class="btn btn-primary">前往任务页</router-link>
        </div>

        <div v-else class="dashboard-change-list">
          <DashboardChangeCard
            v-for="change in activeChanges"
            :key="change.id"
            :change="change"
            @select="goToChange"
          />
        </div>
      </section>

      <!-- 最近活动 -->
      <section class="dashboard-section">
        <div class="dashboard-section__head">
          <h2 class="dashboard-section__title">近期变更</h2>
          <p class="dashboard-section__desc">工作区中最新的变更和规范更新</p>
        </div>

        <div v-if="recentActivity.length === 0" class="empty-state dashboard-section__empty">
          <p class="empty-state__text">暂无活动记录</p>
        </div>

        <div v-else class="dashboard-activity-grid">
          <DashboardActivityCard
            v-for="item in recentActivity"
            :key="item.id"
            :item="item"
            @select="goToChange"
          />
        </div>
      </section>
    </template>

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
    />
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { store } from '../stores/index.js'
import { useDashboard } from '../composables/useDashboard.js'
import { useProjects } from '../composables/useProjects.js'
import DashboardStatCard from '../components/dashboard/DashboardStatCard.vue'
import DashboardChangeCard from '../components/dashboard/DashboardChangeCard.vue'
import DashboardActivityCard from '../components/dashboard/DashboardActivityCard.vue'
import ProjectSelectorModal from '../components/tasks/ProjectSelectorModal.vue'
import AddProjectModal from '../components/tasks/AddProjectModal.vue'

const router = useRouter()

const {
  loading,
  error,
  stats,
  activeChanges,
  recentActivity,
  hasProject,
  loadDashboard
} = useDashboard()

const {
  activeProject,
  projectList,
  showProjectSelector,
  showAddProject,
  browsePath,
  dirList,
  hasOpenspecDir,
  addError,
  manualPath,
  removingProjectId,
  currentBrowsePathStr,
  loadProjects,
  openProjectSelector,
  openAddProject,
  navToRoot,
  navToBreadcrumb,
  enterDir,
  confirmAddProject,
  removeProject,
  setDefaultProject,
  selectProject
} = useProjects(async () => {
  await loadDashboard()
})

const projectName = computed(() => store.activeProject?.name || '未选择项目')

async function refresh() {
  await loadDashboard()
}

function goToChange(changeId) {
  router.push({ path: '/tasks', query: { change: changeId } })
}

onMounted(async () => {
  await loadProjects()
  await loadDashboard()
})
</script>
