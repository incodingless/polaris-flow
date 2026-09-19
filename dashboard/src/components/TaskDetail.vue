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
          <button
            v-if="canWrite"
            class="btn-archive"
            :disabled="cleaning"
            @click="$emit('cleanup-request')"
          >
            <svg class="icon icon--sm" viewBox="0 0 24 24">
              <path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" />
            </svg>
            交付清理
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
      </div>

      <!-- 推进阶段（M3 写操作）。只做推进：回退要写 regressions[] 留痕，属后续切片，
           所以这里不摆一个点了会报错的灰按钮。目标由步骤条推导，阶段未登记时不出现。 -->
      <div v-if="nextPhase" class="phase-advance">
        <template v-if="!confirmingAdvance">
          <button
            type="button"
            class="btn btn--sm"
            :disabled="advancing"
            @click="confirmingAdvance = true"
          >
            推进阶段 → {{ nextPhase.name }}
          </button>
          <span class="phase-advance__hint">写入 workflow.yaml 游标（当前 {{ task.phase }}）</span>
        </template>
        <template v-else>
          <span class="phase-advance__confirm">
            确认推进：<code>{{ task.phase }}</code> → <code>{{ nextPhase.code }}</code>
            （{{ nextPhase.name }}）
          </span>
          <button
            type="button"
            class="btn btn--sm btn--primary"
            :disabled="advancing"
            @click="onConfirmAdvance"
          >
            {{ advancing ? '推进中...' : '确认推进' }}
          </button>
          <button
            type="button"
            class="btn btn--sm"
            :disabled="advancing"
            @click="confirmingAdvance = false"
          >
            取消
          </button>
        </template>
      </div>

      <!-- 交付清理的确认面板：先给「将删除什么」，确认后才执行。
           这是不可逆操作（删游标条目 + rm -rf 任务档案目录），所以把路径逐条列出来，
           而不是用一句「确定吗」。 -->
      <div v-if="cleanupPlan" class="cleanup-confirm">
        <p class="cleanup-confirm__title">交付清理（不可逆）</p>
        <ul class="cleanup-confirm__list">
          <li v-if="cleanupPlan.entry">
            游标条目：<code>{{ cleanupPlan.entry.kind }}_tasks</code> /
            <code>{{ task.name }}</code>（phase: {{ cleanupPlan.entry.phase }}）
          </li>
          <li v-for="p in cleanupPlan.will_delete" :key="p">
            删除目录：<code>{{ p }}</code>
          </li>
          <li v-if="!cleanupPlan.will_delete.length" class="cleanup-confirm__none">
            （没有需要删除的档案目录）
          </li>
        </ul>
        <div class="cleanup-confirm__actions">
          <button
            type="button"
            class="btn btn--sm btn--primary"
            :disabled="cleaning"
            @click="$emit('cleanup-confirm')"
          >
            {{ cleaning ? '清理中...' : '确认删除' }}
          </button>
          <button
            type="button"
            class="btn btn--sm"
            :disabled="cleaning"
            @click="$emit('cleanup-cancel')"
          >
            取消
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
                :plan-file="task.planFile || ''"
                :busy-index="busyIndex"
                @toggle="$emit('toggle-checkbox', $event)"
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
                  :plan-file="task.planFile || ''"
                  :busy-index="busyIndex"
                  @toggle="$emit('toggle-checkbox', $event)"
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
import {
  progressClass,
  buildStageNavItems,
  findActiveStep,
  findNextPhase,
  findStepByNumber,
  isArchivedTask,
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
  getTabFiles
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
  validating: { type: Boolean, default: false },
  validateResult: { type: Object, default: null },
  validateError: { type: String, default: '' },
  /** 正在提交的复选框序号（写操作互斥，避免连点） */
  busyIndex: { type: Number, default: null },
  /** 正在推进阶段 */
  advancing: { type: Boolean, default: false },
  /** 交付清理的预演结果（null = 未在确认中） */
  cleanupPlan: { type: Object, default: null },
  /** 正在执行交付清理 */
  cleaning: { type: Boolean, default: false }
})

const emit = defineEmits([
  'stage-nav',
  'view-session',
  'delete-session',
  'action',
  'tab-change',
  'refresh-file',
  'revalidate',
  'toggle-checkbox',
  'advance-phase',
  'cleanup-request',
  'cleanup-confirm',
  'cleanup-cancel'
])

/** 归档任务的档案已不在活跃游标里，写操作一律不提供入口（后端也会拒） */
const canWrite = computed(() => !isArchivedTask(props.task))

const stageNavItems = computed(() => buildStageNavItems(props.task))

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

watch(() => props.task.name, () => {
  selectedStepNumber.value = null
  selectedFileKey.value = ''
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

// ---- 推进阶段（M3 写操作） ----

/** 目标阶段；由步骤条推导（后端仍是权威，会再校验目标必须严格更晚） */
const nextPhase = computed(() => findNextPhase(props.task))

/** 二次确认：不可逆类操作要先显示「从哪到哪」，避免一点就写 */
const confirmingAdvance = ref(false)

// 切任务时收起确认态，否则会在新任务上残留上一个任务的确认框
watch(() => props.task.name, () => {
  confirmingAdvance.value = false
})

function onConfirmAdvance() {
  if (!nextPhase.value) return
  emit('advance-phase', nextPhase.value)
  confirmingAdvance.value = false
}

// 步骤操作（operations）端点在 M2 移除，操作白名单属 M3（设计文档 §5.2）。
// M3 的写操作各自有显式入口（阶段推进 / 交付清理 / 计划校验），都落在下面的
// 面板或卡片上，不用这个通用「步骤操作」通道 —— 所以相关模板与状态一并删掉了。

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
.phase-advance {
  display: flex;
  align-items: center;
  gap: var(--spacing-8);
  flex-wrap: wrap;
  margin-top: var(--spacing-8);
  padding-top: var(--spacing-8);
  border-top: 1px dashed var(--border-normal);
}
.phase-advance__hint {
  font-size: 12px;
  color: var(--text-helper);
}
.phase-advance__confirm {
  font-size: 13px;
  color: var(--text-secondary);
}
.cleanup-confirm {
  margin-top: var(--spacing-8);
  padding: var(--spacing-12);
  border: 1px solid var(--danger, var(--border-normal));
  border-radius: var(--radius-md);
  background: var(--bg-hover);
}
.cleanup-confirm__title {
  margin: 0 0 var(--spacing-8);
  font-size: 13px;
  font-weight: 700;
  color: var(--danger, var(--text-primary));
}
.cleanup-confirm__list {
  margin: 0 0 var(--spacing-8);
  padding-left: 18px;
  font-size: 12px;
  color: var(--text-secondary);
  word-break: break-all;
}
.cleanup-confirm__none {
  color: var(--text-helper);
}
.cleanup-confirm__actions {
  display: flex;
  gap: var(--spacing-8);
}
</style>
