<template>
  <div class="project-tabs-bar">
    <div ref="addWrapRef" class="project-tab-add-wrap">
      <button
        type="button"
        class="project-tab-add"
        :class="{ active: pickerOpen }"
        aria-label="添加项目标签"
        title="添加项目标签"
        :aria-expanded="pickerOpen"
        @click.stop="togglePicker"
      >
        <svg class="project-tab-add__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </div>
    <button
      v-if="showScrollLeft"
      class="tab-scroll-btn"
      @click="$emit('scroll', -1)"
    >
      <svg class="icon icon--sm" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>
    </button>
    <div class="project-tabs">
      <div
        v-for="(tab, i) in tabs"
        :key="tab.id"
        class="project-tab"
        :class="{ active: tab.active, deleted: tab.deleted }"
        :aria-selected="tab.active"
        @click="$emit('activate', tab, i)"
      >
        <span v-if="tab.loading" class="project-tab__loading"></span>
        <span class="project-tab__name">{{ tab.name }}</span>
        <span
          v-if="!tab.deleted"
          class="project-tab__close"
          :aria-label="'关闭' + tab.name + '标签'"
          @click.stop="$emit('close', tab, i)"
        >✕</span>
      </div>
    </div>
    <Teleport to="body">
      <ProjectTabPicker
        v-if="pickerOpen"
        :style="pickerStyle"
        :projects="projects"
        :open-tab-ids="openTabIds"
        :default-project-id="defaultProjectId"
        @select="onPickProject"
        @manage="onManage"
      />
    </Teleport>
    <button
      v-if="showScrollRight"
      class="tab-scroll-btn"
      @click="$emit('scroll', 1)"
    >
      <svg class="icon icon--sm" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg>
    </button>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import ProjectTabPicker from './ProjectTabPicker.vue'

const props = defineProps({
  tabs: { type: Array, default: () => [] },
  projects: { type: Array, default: () => [] },
  defaultProjectId: { type: String, default: '' },
  showScrollLeft: { type: Boolean, default: false },
  showScrollRight: { type: Boolean, default: false }
})

const emit = defineEmits(['manage', 'activate', 'close', 'scroll', 'pick-project'])

const pickerOpen = ref(false)
const addWrapRef = ref(null)
const pickerStyle = ref({})

const openTabIds = computed(() => new Set(props.tabs.map((t) => t.id)))

function updatePickerPosition() {
  const el = addWrapRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  pickerStyle.value = {
    position: 'fixed',
    top: `${rect.bottom + 8}px`,
    left: `${Math.max(8, rect.left)}px`,
    zIndex: 400
  }
}

async function togglePicker() {
  if (pickerOpen.value) {
    pickerOpen.value = false
    return
  }
  pickerOpen.value = true
  await nextTick()
  updatePickerPosition()
}

function closePicker() {
  pickerOpen.value = false
}

function onPickProject(proj) {
  closePicker()
  emit('pick-project', proj)
}

function onManage() {
  closePicker()
  emit('manage')
}

function onDocumentClick(e) {
  if (!pickerOpen.value) return
  const wrap = addWrapRef.value
  const picker = document.querySelector('.project-tab-picker')
  if (wrap?.contains(e.target) || picker?.contains(e.target)) return
  closePicker()
}

function onWindowChange() {
  if (pickerOpen.value) updatePickerPosition()
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  window.addEventListener('resize', onWindowChange)
  window.addEventListener('scroll', onWindowChange, true)
})
onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
  window.removeEventListener('resize', onWindowChange)
  window.removeEventListener('scroll', onWindowChange, true)
})
</script>
