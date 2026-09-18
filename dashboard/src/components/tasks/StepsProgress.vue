<template>
  <div class="steps-progress">
    <template v-for="(group, gi) in stepGroups" :key="gi">
      <div class="step-group" :class="'group-' + group.status">
        <span class="group-label">{{ group.name }}</span>
        <div class="group-nodes">
          <div
            v-for="(step, si) in group.steps"
            :key="si"
            class="step-node"
            :class="['node-' + step.status, { 'node-selected': step.number === selectedStepNumber }]"
            role="button"
            tabindex="0"
            :aria-pressed="step.number === selectedStepNumber"
            :aria-label="`${step.name}，步骤 ${step.number}`"
            @click="selectStep(group, step)"
            @keydown.enter.prevent="selectStep(group, step)"
            @keydown.space.prevent="selectStep(group, step)"
          >
            <div class="node-card">
              <span v-if="step.status === 'done'" class="node-check-icon">✓</span>
              <div class="node-circle">
                <span class="node-circle-num">{{ step.number }}</span>
              </div>
              <span class="node-name">{{ step.name }}</span>
            </div>
          </div>
        </div>
      </div>
      <span v-if="gi < stepGroups.length - 1" class="group-sep">&gt;</span>
    </template>
  </div>
</template>

<script setup>
defineProps({
  stepGroups: { type: Array, default: () => [] },
  selectedStepNumber: { type: Number, default: null }
})

const emit = defineEmits(['select-step'])

function selectStep(group, step) {
  emit('select-step', { ...step, groupName: step.groupName || group.name })
}
</script>
