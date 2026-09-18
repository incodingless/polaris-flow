<template>
  <div class="tasks-kanban">
    <div class="tasks-kanban__header">
      <div class="tasks-kanban__status-tabs">
        <button
          v-for="tab in statusTabs"
          :key="tab.id"
          type="button"
          class="tasks-kanban__status-tab"
          :class="{ 'tasks-kanban__status-tab--active': statusFilter === tab.id }"
          @click="statusFilter = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>
      <div class="tasks-kanban__header-actions">
        <select
          v-model="selectedSectionId"
          class="tasks-kanban__select"
          aria-label="分类筛选"
        >
          <option value="">全部分类</option>
          <option
            v-for="section in parsed.sections"
            :key="section.id"
            :value="section.id"
          >
            {{ section.title }}
          </option>
        </select>
        <input
          v-model="searchQuery"
          type="search"
          class="tasks-kanban__search"
          placeholder="搜索任务关键词..."
          aria-label="搜索任务"
        />
      </div>
    </div>

    <div v-if="parsed.overallTotal === 0" class="tasks-kanban__empty">
      <p>未识别到 checkbox 任务项</p>
      <p class="tasks-kanban__empty-hint">请切换到「源文件」查看原始 Markdown，或确认文档包含 <code>- [ ]</code> 格式任务</p>
    </div>

    <div v-else-if="visibleSections.length === 0" class="tasks-kanban__empty">
      <p>没有符合筛选条件的任务</p>
    </div>

    <div v-else class="tasks-kanban__sections">
      <section
        v-for="section in visibleSections"
        :key="section.id"
        class="tasks-kanban__section"
      >
        <button
          type="button"
          class="tasks-kanban__section-header"
          :aria-expanded="isExpanded(section.id)"
          @click="toggleSection(section.id)"
        >
          <span
            class="tasks-kanban__section-chevron"
            :class="{ 'tasks-kanban__section-chevron--open': isExpanded(section.id) }"
          >
            <svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </span>
          <span class="tasks-kanban__section-title">{{ section.title }}</span>
          <span class="tasks-kanban__section-count">{{ section.doneCount }}/{{ section.totalCount }}</span>
          <span class="tasks-kanban__section-progress">
            <div class="tasks-kanban__progress-bar tasks-kanban__progress-bar--sm">
              <div
                class="tasks-kanban__progress-fill"
                :style="{ width: section.pct + '%' }"
              ></div>
            </div>
            <span class="tasks-kanban__progress-pct">{{ section.pct }}%</span>
          </span>
        </button>

        <ul v-show="isExpanded(section.id)" class="tasks-kanban__tasks">
          <li
            v-for="item in section.visibleItems"
            :key="item.index"
            class="tasks-kanban__task-row"
          >
            <span
              class="tasks-kanban__status"
              :class="{ 'tasks-kanban__status--done': item.done }"
              role="img"
              :aria-label="item.done ? '已完成' : '未完成'"
            >
              <svg
                v-if="item.done"
                class="tasks-kanban__status-icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>
            <span
              class="tasks-kanban__task-text"
              :class="{ 'tasks-kanban__task-text--done': item.done }"
            >
              {{ item.text }}
            </span>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { parseTaskMarkdown } from '../../utils/parseTaskMarkdown.js'
import { fileDisplayName } from '../../utils/changeFiles.js'

const props = defineProps({
  content: { type: String, default: '' },
  file: { type: Object, default: null },
  boardTitle: { type: String, default: '' }
})

const statusTabs = [
  { id: 'all', label: '全部任务' },
  { id: 'pending', label: '未完成' },
  { id: 'done', label: '已完成' }
]

const searchQuery = ref('')
const statusFilter = ref('all')
const selectedSectionId = ref('')
const expandedSections = ref(new Set())

const parsed = computed(() =>
  parseTaskMarkdown(props.content, fileDisplayName(props.file) || props.boardTitle)
)

/** 按搜索词与完成状态过滤任务项 */
function filterItems(items) {
  const query = searchQuery.value.trim().toLowerCase()
  return items.filter((item) => {
    if (statusFilter.value === 'pending' && item.done) return false
    if (statusFilter.value === 'done' && !item.done) return false
    if (query && !item.text.toLowerCase().includes(query)) return false
    return true
  })
}

const visibleSections = computed(() => {
  return parsed.value.sections
    .filter((section) => !selectedSectionId.value || section.id === selectedSectionId.value)
    .map((section) => {
      const visibleItems = filterItems(section.items)
      const visibleCount = visibleItems.length
      const visibleDone = visibleItems.filter((item) => item.done).length
      const visiblePct = visibleCount ? Math.round((visibleDone / visibleCount) * 100) : 0
      return {
        ...section,
        visibleItems,
        visibleCount,
        visiblePct
      }
    })
    .filter((section) => section.visibleCount > 0)
})

function isExpanded(sectionId) {
  return expandedSections.value.has(sectionId)
}

function toggleSection(sectionId) {
  const next = new Set(expandedSections.value)
  if (next.has(sectionId)) {
    next.delete(sectionId)
  } else {
    next.add(sectionId)
  }
  expandedSections.value = next
}

function resetUiState() {
  searchQuery.value = ''
  statusFilter.value = 'all'
  selectedSectionId.value = ''
  expandedSections.value = new Set(parsed.value.sections.map((section) => section.id))
}

watch(
  () => [props.content, props.file?.path, props.file?.name],
  () => resetUiState(),
  { immediate: true }
)
</script>
