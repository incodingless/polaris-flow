<template>
  <div class="tasks-file-panel">
    <div class="tasks-file-panel__toolbar">
      <div v-if="file" class="tasks-file-panel__meta">
        <h2 class="tasks-file-panel__title">{{ parsed.title }}</h2>
        <div class="tasks-file-panel__overall">
          <span class="tasks-file-panel__overall-label">
            任务进度 {{ parsed.overallDone }}/{{ parsed.overallTotal }}
          </span>
          <div class="tasks-kanban__progress-bar">
            <div
              class="tasks-kanban__progress-fill"
              :style="{ width: parsed.overallPct + '%' }"
            ></div>
          </div>
          <span class="tasks-kanban__progress-pct">{{ parsed.overallPct }}%</span>
        </div>
      </div>
      <ViewModeToggle v-model="viewMode" />
    </div>

    <div class="tasks-file-panel__body">
      <div v-if="!file" class="change-file-view__empty">暂无文件</div>
      <TasksKanbanPreview
        v-else-if="viewMode === 'preview'"
        :content="file.content || ''"
        :file="file"
        :board-title="boardTitle"
        :editable="editable"
        :busy-index="busyIndex"
        @toggle="$emit('toggle', $event)"
      />
      <pre v-else class="tasks-file-panel__source"><code>{{ file.content || '（空文件）' }}</code></pre>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { fileKey, fileDisplayName } from '../../utils/changeFiles.js'
import { parseTaskMarkdown } from '../../utils/parseTaskMarkdown.js'
import ViewModeToggle from './ViewModeToggle.vue'
import TasksKanbanPreview from './TasksKanbanPreview.vue'

const props = defineProps({
  file: { type: Object, default: null },
  boardTitle: { type: String, default: '' },
  /**
   * 可勾选的计划文件（项目根相对路径，来自 task.plan_file）。
   * 只有当前文件**正是**它时才允许勾选 —— 靠路径精确比对，不靠文件名猜，
   * 否则在同名文件（如 openspec 的 tasks.md 与 .polaris 的 tasks.md）上会改错对象。
   */
  planFile: { type: String, default: '' },
  /** 正在提交的复选框序号 */
  busyIndex: { type: Number, default: null }
})

defineEmits(['toggle'])

const editable = computed(
  () => props.planFile !== '' && props.file?.path === props.planFile
)

const viewMode = ref('preview')

const parsed = computed(() =>
  parseTaskMarkdown(
    props.file?.content || '',
    fileDisplayName(props.file) || props.boardTitle
  )
)

watch(
  () => [fileKey(props.file), props.boardTitle],
  () => {
    viewMode.value = 'preview'
  }
)
</script>

<style scoped>
.tasks-file-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.tasks-file-panel__toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-16);
  padding-bottom: var(--spacing-12);
  margin-bottom: var(--spacing-12);
  border-bottom: 1px solid var(--border-normal);
}

.tasks-file-panel__meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-8);
}

.tasks-file-panel__title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.3;
}

.tasks-file-panel__overall {
  display: flex;
  align-items: center;
  gap: var(--spacing-8);
  max-width: 360px;
}

.tasks-file-panel__overall-label {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.tasks-file-panel__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.tasks-file-panel__source {
  margin: 0;
  padding: var(--spacing-12);
  background: var(--bg-global);
  border-radius: var(--radius-md);
  overflow: auto;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.tasks-file-panel__source code {
  font-family: var(--font-mono);
  color: var(--text-primary);
}
</style>
