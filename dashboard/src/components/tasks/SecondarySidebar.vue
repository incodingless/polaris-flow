<template>
  <aside class="secondary-sidebar" :class="{ collapsed }">
    <div class="secondary-actions">
      <div class="secondary-actions__left">
        <button class="btn btn--sm btn--new-change" @click="$emit('new-change')">
          + 新变更
        </button>
      </div>
      <div class="secondary-actions__right">
        <button
          class="btn btn--icon"
          :class="{ active: searchOpen }"
          title="检索"
          @click="toggleSearch"
        >
          <svg class="icon" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </button>
        <button
          class="btn btn--icon"
          :title="sortBy === 'time' ? '按时间排序' : '按名称排序'"
          @click="$emit('toggle-sort')"
        >
          <svg v-if="sortBy === 'time'" class="icon" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          <svg v-else class="icon" viewBox="0 0 24 24">
            <path d="M4 6h16M4 12h10M4 18h6" />
          </svg>
        </button>
        <button class="btn btn--icon" title="刷新" @click="$emit('refresh')">
          <svg class="icon" viewBox="0 0 24 24">
            <path d="M21 12a9 9 0 1 1-3-6.7" />
            <path d="M21 3v6h-6" />
          </svg>
        </button>
      </div>
    </div>

    <!-- 操作栏下方：列表过滤（默认隐藏，点击检索按钮展开） -->
    <div v-if="searchOpen" class="secondary-search">
      <input
        ref="searchInputRef"
        type="search"
        class="secondary-search__input"
        :placeholder="searchPlaceholder"
        :value="searchQuery"
        @input="$emit('search', $event.target.value)"
      />
    </div>

    <!-- 规格模式：文件列表 -->
    <div v-if="mode === 'specs'" class="task-list">
      <div
        v-for="file in specFiles"
        :key="file.path"
        class="file-item"
        :class="{ active: viewingSpecFile?.path === file.path }"
        @click="$emit('select-spec', file)"
      >
        <span class="file-item__icon">
          <svg class="icon icon--sm" viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
          </svg>
        </span>
        <span class="file-item__name">{{ file.name }}</span>
      </div>
      <div v-if="specFiles.length === 0" class="empty-state">
        <div class="empty-state__text">{{ searchQuery ? '无匹配结果' : '暂无规格文件' }}</div>
      </div>
    </div>

    <!-- 任务模式：任务卡片 -->
    <div v-else class="task-list">
      <TaskCardItem
        v-for="task in tasks"
        :key="task.id"
        :task="task"
        :active="viewingTask?.id === task.id"
        @click="$emit('select', task)"
      />
      <div v-if="tasks.length === 0" class="empty-state">
        <div class="empty-state__text">{{ searchQuery ? '无匹配结果' : '暂无任务' }}</div>
      </div>
    </div>

    <div class="secondary-info">
      <span v-if="mode === 'specs'" class="secondary-info__count">
        {{ specFiles.length }} 个规格文件<span v-if="searchQuery && specTotal > specFiles.length"> / {{ specTotal }}</span>
      </span>
      <span v-else class="secondary-info__count">
        {{ tasks.length }} 个{{ searchQuery ? '结果' : '任务' }}<span v-if="searchQuery && taskTotal > tasks.length"> / {{ taskTotal }}</span>
      </span>
    </div>
  </aside>
</template>

<script setup>
import { computed, ref, nextTick } from 'vue'
import TaskCardItem from '../TaskCardItem.vue'

const props = defineProps({
  tasks: { type: Array, default: () => [] },
  viewingTask: { type: Object, default: null },
  collapsed: { type: Boolean, default: false },
  sortBy: { type: String, default: 'time' },
  mode: { type: String, default: 'tasks' },
  searchQuery: { type: String, default: '' },
  specFiles: { type: Array, default: () => [] },
  viewingSpecFile: { type: Object, default: null },
  taskTotal: { type: Number, default: 0 },
  specTotal: { type: Number, default: 0 }
})

const searchInputRef = ref(null)
const searchOpen = ref(false)

const emit = defineEmits(['new-change', 'toggle-sort', 'refresh', 'select', 'search', 'select-spec'])

/** 切换搜索框显示；关闭时清空过滤条件 */
async function toggleSearch() {
  if (searchOpen.value) {
    searchOpen.value = false
    emit('search', '')
    return
  }
  searchOpen.value = true
  await nextTick()
  const el = searchInputRef.value
  if (el) {
    el.focus()
  }
}

const searchPlaceholder = computed(() => {
  if (props.mode === 'specs') {
    return '搜索规格文件名、路径...'
  }
  return '搜索变更名称、标题、标签...'
})
</script>

<style scoped>
.secondary-search {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-normal);
}

.secondary-search__input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 10px;
  font-size: 13px;
  background: var(--bg-input);
  border: 1px solid var(--border-normal);
  border-radius: var(--radius-md);
  color: var(--text-primary);
}

.secondary-search__input:focus {
  outline: none;
  border-color: var(--primary);
}

.secondary-actions__right .btn--icon.active {
  background: var(--primary-bg);
  color: var(--primary-light);
}
</style>
