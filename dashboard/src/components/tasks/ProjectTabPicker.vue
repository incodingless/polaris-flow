<template>
  <div class="project-tab-picker" @click.stop>
    <div class="project-tab-picker__header">
      <span class="project-tab-picker__title">纳管项目</span>
      <button type="button" class="project-tab-picker__manage" @click="$emit('manage')">
        管理项目
      </button>
    </div>
    <div class="project-tab-picker__list">
      <div
        v-if="projects.length === 0"
        class="project-tab-picker__empty"
      >
        暂无纳管项目
      </div>
      <button
        v-for="proj in projects"
        :key="proj.id"
        type="button"
        class="project-tab-picker__item"
        :class="{ 'project-tab-picker__item--open': openTabIds.has(proj.id) }"
        @click="$emit('select', proj)"
      >
        <span class="project-tab-picker__icon">
          <svg class="icon icon--sm" viewBox="0 0 24 24">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </span>
        <span class="project-tab-picker__info">
          <span class="project-tab-picker__name">{{ proj.name }}</span>
          <span class="project-tab-picker__path">{{ proj.path }}</span>
        </span>
        <span v-if="proj.id === defaultProjectId" class="project-tab-picker__badge">默认</span>
      </button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  projects: { type: Array, default: () => [] },
  openTabIds: { type: Object, default: () => new Set() },
  defaultProjectId: { type: String, default: '' }
})

defineEmits(['select', 'manage'])
</script>
