<template>
  <div v-if="stepGroups.length" class="workflow-thumbnail" aria-label="流程缩略图">
    <div class="workflow-thumbnail__track">
      <template v-for="(group, index) in stepGroups" :key="group.name + '-' + index">
        <span
          class="workflow-thumbnail__sep"
          :class="'workflow-thumbnail__sep--' + thumbMeta(index).separator"
          aria-hidden="true"
        >
          <svg viewBox="0 0 6 22" fill="none">
            <path d="M5 1C2 6 2 16 5 21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </span>
        <div
          class="workflow-thumbnail__item"
          :class="itemClass(group)"
          :title="group.name"
        >
          <StageContentIcon :stage-id="thumbMeta(index).iconId" />
          <span class="workflow-thumbnail__label">{{ group.name }}</span>
          <span
            v-if="group.status === 'completed'"
            class="workflow-thumbnail__check"
            aria-hidden="true"
          >✓</span>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { getWorkflowThumbMeta } from '../../utils/workflow.js'
import StageContentIcon from './StageContentIcon.vue'

defineProps({
  stepGroups: { type: Array, default: () => [] }
})

function thumbMeta(index) {
  return getWorkflowThumbMeta(index)
}

function itemClass(group) {
  if (group.status === 'completed') return 'workflow-thumbnail__item--completed'
  if (group.status === 'active') return 'workflow-thumbnail__item--active'
  return 'workflow-thumbnail__item--pending'
}
</script>
