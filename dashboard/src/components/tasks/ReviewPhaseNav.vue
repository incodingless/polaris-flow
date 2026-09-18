<template>
  <nav v-if="tabs.length" class="review-phase-nav" aria-label="产出物页签">
    <div class="workflow-thumbnail__track review-phase-nav__track">
      <template v-for="(tab, index) in tabs" :key="tab.id">
        <span
          class="workflow-thumbnail__sep"
          :class="'workflow-thumbnail__sep--' + thumbMeta(index).separator"
          aria-hidden="true"
        >
          <svg viewBox="0 0 6 22" fill="none">
            <path d="M5 1C2 6 2 16 5 21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </span>
        <button
          type="button"
          class="review-phase-nav__item"
          :class="{ 'review-phase-nav__item--active': activeTab === tab.id }"
          @click="$emit('select', tab.id)"
        >
          <StageContentIcon :stage-id="tab.id" icon-class="icon--tab-nav" />
          <span class="workflow-thumbnail__label">{{ tab.label }}</span>
          <span class="review-phase-nav__count">({{ tab.count }})</span>
        </button>
      </template>
    </div>
  </nav>
</template>

<script setup>
import { getWorkflowThumbMeta } from '../../utils/workflow.js'
import StageContentIcon from './StageContentIcon.vue'

defineProps({
  tabs: { type: Array, default: () => [] },
  activeTab: { type: String, default: '' }
})

defineEmits(['select'])

function thumbMeta(index) {
  return getWorkflowThumbMeta(index)
}
</script>
