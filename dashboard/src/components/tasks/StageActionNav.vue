<template>
  <div class="stage-action-nav" role="group" aria-label="会话操作">
    <button
      v-for="item in actionItems"
      :key="item.id"
      type="button"
      class="stage-action-nav__btn"
      :class="{ active: activeId === item.id }"
      @click="$emit('select', item.id)"
    >
      <svg class="icon icon--sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <template v-if="item.id === 'info'">
          <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
        </template>
        <template v-else-if="item.id === 'conversation'">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <path d="m9 11 3 3L22 4" />
        </template>
        <template v-else-if="item.id === 'review'">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
        </template>
      </svg>
      {{ item.label }}
    </button>

    <div ref="moreRef" class="stage-action-nav__more">
      <button
        type="button"
        class="stage-action-nav__btn stage-action-nav__more-trigger"
        :class="{ active: moreOpen }"
        aria-haspopup="menu"
        :aria-expanded="moreOpen"
        @click.stop="toggleMore"
      >
        更多
        <svg class="icon icon--xs stage-action-nav__chevron" :class="{ open: moreOpen }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div v-if="moreOpen" class="stage-action-nav__dropdown" role="menu">
        <button type="button" class="stage-action-nav__dropdown-item" role="menuitem" @click="handleView">
          <svg class="icon icon--sm" viewBox="0 0 24 24">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          打开目录
        </button>
        <button type="button" class="stage-action-nav__dropdown-item stage-action-nav__dropdown-item--danger" role="menuitem" @click="handleDelete">
          <svg class="icon icon--sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </svg>
          删除
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { STAGE_ACTION_NAV_IDS } from '../../utils/workflow.js'

const props = defineProps({
  items: { type: Array, default: () => [] },
  activeId: { type: String, default: '' }
})

const emit = defineEmits(['select', 'delete', 'view'])

const moreRef = ref(null)
const moreOpen = ref(false)

const actionItems = computed(() =>
  props.items.filter((item) => STAGE_ACTION_NAV_IDS.includes(item.id))
)

function toggleMore() {
  moreOpen.value = !moreOpen.value
}

function closeMore() {
  moreOpen.value = false
}

function handleView() {
  closeMore()
  emit('view')
}

function handleDelete() {
  closeMore()
  emit('delete')
}

function onDocumentClick(e) {
  if (moreRef.value && !moreRef.value.contains(e.target)) {
    closeMore()
  }
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onUnmounted(() => document.removeEventListener('click', onDocumentClick))
</script>
