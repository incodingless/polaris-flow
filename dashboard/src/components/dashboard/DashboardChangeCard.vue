<template>
  <article
    class="dashboard-change-card"
    role="button"
    tabindex="0"
    @click="$emit('select', change.id)"
    @keydown.enter="$emit('select', change.id)"
  >
    <header class="dashboard-change-card__header">
      <h3 class="dashboard-change-card__title">{{ change.title }}</h3>
      <div v-if="change.badges.length" class="dashboard-change-card__badges">
        <span
          v-for="badge in change.badges"
          :key="badge.key"
          class="badge"
          :class="badgeClass(badge.type)"
        >{{ badge.label }}</span>
      </div>
    </header>

    <div class="dashboard-change-card__meta">
      <span class="dashboard-change-card__meta-item">更新 {{ change.updatedAt }}</span>
      <span class="dashboard-change-card__meta-item">{{ change.specDeltas }} 条规范差异</span>
      <span class="dashboard-change-card__meta-item">{{ change.taskStats }} 任务</span>
    </div>

    <div class="dashboard-change-card__progress">
      <span class="dashboard-change-card__progress-label">进度</span>
      <div class="mini-progress dashboard-change-card__progress-bar">
        <div
          class="mini-progress__bar"
          :class="barClass"
          :style="{ width: change.progressPct + '%' }"
        />
      </div>
      <span class="dashboard-change-card__progress-pct">{{ change.progressPct }}%</span>
    </div>
  </article>
</template>

<script setup>
import { computed } from 'vue'
import { progressBarClass } from '../../utils/dashboardHelpers.js'

const props = defineProps({
  change: { type: Object, required: true }
})

defineEmits(['select'])

const barClass = computed(() => progressBarClass(props.change.progressPct))

function badgeClass(type) {
  const map = {
    proposal: 'badge--accent',
    design: 'badge--primary',
    specs: 'badge--success',
    tasks: 'badge--warning',
    other: 'badge--accent'
  }
  return map[type] || 'badge--primary'
}
</script>
