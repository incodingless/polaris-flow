<template>
  <div class="task-detail">
    <div class="detail-header">
      <div class="detail-header__title-row">
        <div class="detail-header__info">
          <div class="detail-header__title">{{ task.name }}</div>
          <div v-if="task.background" class="detail-header__summary">{{ task.background }}</div>
        </div>
        <StageActionNav
          :items="stageNavItems"
          :active-id="activeStageNav"
          @select="$emit('stage-nav', $event)"
          @view="$emit('view-session')"
          @delete="$emit('delete-session')"
        />
      </div>
      <div class="detail-header__meta">
        <span>创建: {{ formatDate(task.time) }}</span>
        <span>规格: {{ task.specs }} 个</span>
        <span>工作流: {{ task.workflow }}</span>
        <span class="detail-header__meta-progress">
          任务进度: {{ task.doneSteps }}/{{ task.totalSteps }}
          <div class="detail-header__progress-bar">
            <div
              class="detail-header__progress-fill"
              :class="progressClass(task.pct)"
              :style="{ width: task.pct + '%' }"
            ></div>
          </div>
        </span>
      </div>
    </div>

    <div class="detail-main">
      <div class="detail-body">
        <WorkflowThumbnail
          :step-groups="task.stepGroups || []"
        />
        <StepsProgress
          :step-groups="task.stepGroups"
          :selected-step-number="highlightedStepNumber"
          @select-step="onSelectStep"
        />

        <div v-if="showCompletionCard" class="stage-card stage-card--done">
        <div class="stage-card__header">
          <span class="stage-card__num">{{ task.currentStep }}</span>
          <h3>Execution Completed</h3>
        </div>
        <p>计划已执行完成，所有任务项均已通过验证。</p>
        <div class="stage-card-actions">
          <button class="btn-archive" @click="$emit('action', '归档计划')">
            <svg class="icon icon--sm" viewBox="0 0 24 24">
              <path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" />
            </svg>
            Archive Plan
          </button>
          <span class="tag tag-success">Done</span>
        </div>
      </div>
      <div v-else-if="displayStep" class="stage-card" :class="'stage-card--' + displayStep.status">
        <div class="stage-card__header">
          <span class="stage-card__num">{{ displayStep.number }}</span>
          <div class="stage-card__title-wrap">
            <h3>{{ displayStep.name }}</h3>
            <p class="stage-card__group">{{ displayStep.groupName }}</p>
          </div>
          <span class="tag" :class="stepTagClass(displayStep.status)">{{ STEP_STATUS_LABELS[displayStep.status] }}</span>
        </div>
        <p v-if="displayStep.description">{{ displayStep.description }}</p>
        <p v-else>{{ stepFallbackText(displayStep) }}</p>
        <p v-if="stepCheckText" class="stage-card__check">{{ stepCheckText }}</p>
        <div v-if="showStepOperations" class="stage-card-actions">
          <button
            v-for="op in stepOperations"
            :key="op.code + (op.target || '')"
            class="btn"
            :class="{ 'btn--primary': op.code === 'continue' }"
            :disabled="!!executingOperationCode"
            @click="onStepAction(op)"
          >
            {{ executingOperationCode === op.code ? `${op.name}...` : op.name }}
          </button>
        </div>
      </div>

      </div>

      <Transition name="review-slide">
        <div v-if="showValidationPanel" class="review-panel validation-panel">
          <ValidationPanel
            :validating="validating"
            :result="validateResult"
            :error="validateError"
            @revalidate="$emit('revalidate')"
          />
        </div>
      </Transition>

      <Transition name="review-slide">
        <div v-if="showReviewPanel" class="review-panel">
          <ReviewPhaseNav
            :tabs="detailTabs"
            :active-tab="activeTab"
            @select="$emit('tab-change', $event)"
          />
          <div class="review-panel__body">
            <div class="view-content">
            <div v-if="detailTabs.length === 0" class="change-file-view__empty">
              暂无产出物分组定义
            </div>
            <!-- 单文件 Tab：文件名 + 内容 -->
            <div v-else-if="!isSplitTab && singleTabFile" class="change-file-single">
              <ChangeFileListItem
                :name="fileDisplayName(singleTabFile)"
                active
                :refreshing="refreshingFileKey === fileKey(singleTabFile)"
                :selectable="false"
                @refresh="$emit('refresh-file', singleTabFile)"
              />
              <TasksFilePanel
                v-if="activeTab === 'tasks'"
                :file="singleTabFile"
                :board-title="task.title"
              />
              <ChangeFileView
                v-else
                :file="singleTabFile"
                :show-header="false"
              />
            </div>

            <!-- 多文件 Tab：顶部文件页签 + 下方内容 -->
            <div
              v-else
              class="split-view"
              style="height:100%;"
            >
              <div class="split-view__tabs">
                <ChangeFileListItem
                  v-for="f in activeTabFiles"
                  :key="fileKey(f)"
                  layout="tab"
                  :name="fileDisplayName(f)"
                  :active="fileKey(f) === selectedFileKey"
                  :refreshing="refreshingFileKey === fileKey(f)"
                  @select="selectedFileKey = fileKey(f)"
                  @refresh="$emit('refresh-file', f)"
                />
                <div v-if="activeTabFiles.length === 0" class="change-file-view__empty change-file-view__empty--inline">
                  暂无文件
                </div>
              </div>
              <div
                class="split-view__right"
                :class="{ 'split-view__right--plain': activeTab !== 'tasks' }"
              >
                <TasksFilePanel
                  v-if="activeTab === 'tasks'"
                  :file="selectedFile"
                  :board-title="task.title"
                />
                <ChangeFileView v-else :file="selectedFile" />
              </div>
            </div>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { fetchWorkflowStepOperations } from '../api/index.js'
import {
  progressClass,
  STAGE_NAV_ITEMS,
  findActiveStep,
  findStepByNumber,
  shouldShowStepOperations,
  STEP_STATUS_LABELS,
  formatStepCheck,
  stepFallbackText
} from '../utils/workflow.js'
import { formatDate } from '../utils/index.js'
import {
  buildDetailTabs,
  categorizeChangeFiles,
  fileDisplayName,
  fileKey,
  getTabFiles,
  normalizeStepOperations
} from '../utils/changeFiles.js'
import StageActionNav from './tasks/StageActionNav.vue'
import StepsProgress from './tasks/StepsProgress.vue'
import WorkflowThumbnail from './tasks/WorkflowThumbnail.vue'
import ChangeFileView from './tasks/ChangeFileView.vue'
import ChangeFileListItem from './tasks/ChangeFileListItem.vue'
import TasksFilePanel from './tasks/TasksFilePanel.vue'
import ReviewPhaseNav from './tasks/ReviewPhaseNav.vue'
import ValidationPanel from './tasks/ValidationPanel.vue'

const props = defineProps({
  task: { type: Object, required: true },
  activeTab: { type: String, default: 'proposal' },
  activeStageNav: { type: String, default: '' },
  allStepsDone: { type: Boolean, default: false },
  currentGroupName: { type: String, default: '' },
  refreshingFileKey: { type: String, default: '' },
  executingOperationCode: { type: String, default: '' },
  validating: { type: Boolean, default: false },
  validateResult: { type: Object, default: null },
  validateError: { type: String, default: '' }
})

const emit = defineEmits([
  'stage-nav',
  'view-session',
  'delete-session',
  'action',
  'tab-change',
  'refresh-file',
  'revalidate'
])

const stageNavItems = STAGE_NAV_ITEMS

const showReviewPanel = computed(() => props.activeStageNav === 'review')
const showValidationPanel = computed(() => props.activeStageNav === 'conversation')

const filesByTab = computed(() =>
  categorizeChangeFiles(
    props.task.files || [],
    props.task.artifactPhases || [],
    props.task.workflowPhases || [],
    props.task.specFiles || []
  )
)
const detailTabs = computed(() =>
  buildDetailTabs(props.task.workflowPhases || [], filesByTab.value)
)
const activeTabFiles = computed(() => getTabFiles(filesByTab.value, props.activeTab))
const isSplitTab = computed(() => activeTabFiles.value.length > 1)
const singleTabFile = computed(() => activeTabFiles.value[0] || null)

const selectedFileKey = ref('')
const selectedFile = computed(() => {
  const files = activeTabFiles.value
  if (!files.length) return null
  return files.find((f) => fileKey(f) === selectedFileKey.value) || files[0]
})

const selectedStepNumber = ref(null)
const stepOperations = ref([])
let stepOperationsRequestId = 0

watch(() => props.task.name, () => {
  selectedStepNumber.value = null
  selectedFileKey.value = ''
  stepOperations.value = []
})

watch([() => props.activeTab, activeTabFiles], () => {
  const files = activeTabFiles.value
  const current = files.find((f) => fileKey(f) === selectedFileKey.value)
  if (!current) {
    selectedFileKey.value = files[0] ? fileKey(files[0]) : ''
  }
})

watch(detailTabs, (tabs) => {
  if (!tabs.length) return
  if (!tabs.some((tab) => tab.id === props.activeTab)) {
    emit('tab-change', tabs[0].id)
  }
})

const displayStep = computed(() => {
  const groups = props.task.stepGroups || []
  if (selectedStepNumber.value != null) {
    return findStepByNumber(groups, selectedStepNumber.value)
  }
  return findActiveStep(groups)
})

const highlightedStepNumber = computed(() =>
  selectedStepNumber.value ?? displayStep.value?.number ?? null
)

const showCompletionCard = computed(() =>
  props.allStepsDone && selectedStepNumber.value == null
)

const stepCheckText = computed(() => formatStepCheck(displayStep.value?.check))

/** 按步骤状态与后继步骤决定是否展示操作按钮 */
const showStepOperations = computed(() =>
  shouldShowStepOperations(
    displayStep.value,
    props.task.stepGroups || [],
    stepOperations.value
  )
)

/** 按当前展示步骤拉取可执行操作 */
async function loadStepOperations(step) {
  const workflowId = props.task.schemaId || props.task.workflow || ''
  if (!workflowId || !step?.id) {
    stepOperations.value = []
    return
  }

  const requestId = ++stepOperationsRequestId
  const { data, error } = await fetchWorkflowStepOperations(workflowId, step.id)
  if (requestId !== stepOperationsRequestId) return

  if (error) {
    stepOperations.value = []
    return
  }
  stepOperations.value = normalizeStepOperations(data)
}

watch(displayStep, (step) => {
  loadStepOperations(step)
}, { immediate: true })

function onStepAction(op) {
  const step = displayStep.value
  emit('action', {
    code: op.code,
    name: op.name,
    target: op.target,
    stepId: step?.id || ''
  })
}

function onSelectStep(step) {
  selectedStepNumber.value = step.number
}

function stepTagClass(status) {
  if (status === 'done') return 'tag-success'
  if (status === 'active') return 'tag-warning'
  return 'tag-disabled'
}

</script>

<style scoped>
.task-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
</style>
