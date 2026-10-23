<template>
  <article
    class="dashboard-stat-card card"
    :class="{ 'dashboard-stat-card--tasks': variant === 'tasks' }"
  >
    <!-- 顶栏：标题 + 图标 -->
    <div class="dashboard-stat-card__header">
      <div
        class="dashboard-stat-card__titles"
        :class="{ 'dashboard-stat-card__titles--stacked': titleStacked }"
      >
        <span class="dashboard-stat-card__title-en">{{ titleCn }}</span>
      </div>
      <div
        class="dashboard-stat-card__icon"
        :class="`dashboard-stat-card__icon--${icon}`"
        aria-hidden="true"
      >
        <component :is="iconComponent" />
      </div>
    </div>

    <!-- 主数值 -->
    <div class="dashboard-stat-card__body">
      <template v-if="variant === 'tasks'">
        <span class="dashboard-stat-card__value">{{ taskPct }}%</span>
        <span class="dashboard-stat-card__fraction">{{ tasksDone }}/{{ tasksTotal }}</span>
      </template>
      <div v-else class="dashboard-stat-card__value">{{ displayValue }}</div>
    </div>

    <!-- 底部说明 -->
    <p v-if="hint" class="dashboard-stat-card__hint">{{ hint }}</p>

    <!-- 任务进度条（色彩保持不变） -->
    <div v-if="variant === 'tasks'" class="dashboard-stat-card__bar">
      <div
        class="dashboard-stat-card__bar-fill"
        :class="barClass"
        :style="{ width: taskPct + '%' }"
      />
    </div>
  </article>
</template>

<script setup>
import { computed, h } from 'vue'
import { progressBarClass } from '../../utils/dashboardHelpers.js'

const props = defineProps({
  variant: { type: String, default: 'default' },
  icon: { type: String, default: 'active' },
  titleEn: { type: String, default: '' },
  titleCn: { type: String, default: '' },
  titleStacked: { type: Boolean, default: false },
  value: { type: [String, Number], default: 0 },
  hint: { type: String, default: '' },
  taskPct: { type: Number, default: 0 },
  tasksDone: { type: Number, default: 0 },
  tasksTotal: { type: Number, default: 0 }
})

const displayValue = computed(() => props.value ?? '—')
const barClass = computed(() => progressBarClass(props.taskPct))

/** 各卡片右上角图标 */
const ICONS = {
  active: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
    h('path', { d: 'M12 20h9' }),
    h('path', { d: 'M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z' })
  ]),
  archive: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
    h('path', { d: 'M21 8v13H3V8' }),
    h('path', { d: 'M1 3h22v5H1z' }),
    h('path', { d: 'M10 12h4' })
  ]),
  specs: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
    h('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
    h('path', { d: 'M14 2v6h6' }),
    h('path', { d: 'M16 13H8' }),
    h('path', { d: 'M16 17H8' }),
    h('path', { d: 'M10 9H8' })
  ]),
  tasks: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
    h('circle', { cx: '12', cy: '12', r: '10' }),
    h('path', { d: 'm9 12 2 2 4-4' })
  ])
}

const iconComponent = computed(() => ICONS[props.icon] || ICONS.active)
</script>
