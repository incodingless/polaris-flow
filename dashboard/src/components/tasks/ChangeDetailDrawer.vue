<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="drawer-overlay"
      @click.self="$emit('close')"
    >
      <aside class="change-detail-drawer" role="dialog" aria-labelledby="change-detail-title">
        <header class="change-detail-drawer__header">
          <div class="change-detail-drawer__header-main">
            <svg class="icon icon--sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
            </svg>
            <div>
              <h2 id="change-detail-title" class="change-detail-drawer__title">变更详情</h2>
              <p class="change-detail-drawer__subtitle">{{ task.title || task.name }}</p>
            </div>
          </div>
          <button type="button" class="change-detail-drawer__close" aria-label="关闭" @click="$emit('close')">✕</button>
        </header>

        <div class="change-detail-drawer__body">
          <section class="change-detail-drawer__section">
            <h3 class="change-detail-drawer__section-title">基本信息</h3>
            <dl class="change-detail-drawer__meta">
              <div class="change-detail-drawer__meta-row">
                <dt>变更 ID</dt>
                <dd><code>{{ task.name }}</code></dd>
              </div>
              <div class="change-detail-drawer__meta-row">
                <dt>阶段</dt>
                <dd>{{ phaseLabel }}</dd>
              </div>
              <div class="change-detail-drawer__meta-row">
                <dt>状态</dt>
                <dd><span class="tag" :class="'tag-' + (task.statusType || 'info')">{{ task.status }}</span></dd>
              </div>
              <div class="change-detail-drawer__meta-row">
                <dt>工作流</dt>
                <dd>{{ task.workflow || '-' }}</dd>
              </div>
              <div class="change-detail-drawer__meta-row">
                <dt>当前分组</dt>
                <dd>{{ task.currentGroup || '-' }}</dd>
              </div>
              <div class="change-detail-drawer__meta-row">
                <dt>创建时间</dt>
                <dd>{{ formatDate(task.created || task.time) }}</dd>
              </div>
              <div class="change-detail-drawer__meta-row">
                <dt>最后修改</dt>
                <dd>{{ formatDate(task.time) }}</dd>
              </div>
              <div v-if="task.labels?.length" class="change-detail-drawer__meta-row">
                <dt>标签</dt>
                <dd>
                  <span v-for="label in task.labels" :key="label" class="change-detail-drawer__label">{{ label }}</span>
                </dd>
              </div>
              <div class="change-detail-drawer__meta-row">
                <dt>进度</dt>
                <dd>{{ task.doneSteps }}/{{ task.totalSteps }} 步骤（{{ task.pct }}%）</dd>
              </div>
              <div v-if="task.changePath" class="change-detail-drawer__meta-row">
                <dt>目录路径</dt>
                <dd><code class="change-detail-drawer__path">{{ task.changePath }}</code></dd>
              </div>
            </dl>
          </section>

          <section v-if="task.background" class="change-detail-drawer__section">
            <h3 class="change-detail-drawer__section-title">摘要</h3>
            <div class="change-detail-drawer__text-block">{{ task.background }}</div>
          </section>

          <section v-if="task.files?.length" class="change-detail-drawer__section">
            <h3 class="change-detail-drawer__section-title">关联文件（{{ task.files.length }}）</h3>
            <table class="change-detail-drawer__table">
              <thead>
                <tr>
                  <th>文件名称</th>
                  <th>路径</th>
                  <th>类型</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="file in task.files" :key="file.path || file.name">
                  <td>{{ file.name }}</td>
                  <td><code>{{ file.path }}</code></td>
                  <td>{{ fileType(file.name) }}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section v-if="task.workflowError" class="change-detail-drawer__section">
            <h3 class="change-detail-drawer__section-title">工作流错误</h3>
            <div class="change-detail-drawer__error">{{ task.workflowError }}</div>
          </section>
        </div>
      </aside>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onUnmounted, watch } from 'vue'
import { formatDate } from '../../utils/index.js'

const PHASE_LABELS = {
  proposal: '提案',
  design: '设计',
  specs: '规格',
  tasks: '任务',
  done: '完成',
  archived: '已归档'
}

const props = defineProps({
  visible: { type: Boolean, default: false },
  task: { type: Object, required: true }
})

const emit = defineEmits(['close'])

const phaseLabel = computed(() => PHASE_LABELS[props.task.phase] || props.task.phase || '-')

function onEscape(e) {
  if (e.key === 'Escape') emit('close')
}

watch(
  () => props.visible,
  (open) => {
    if (open) {
      document.addEventListener('keydown', onEscape)
    } else {
      document.removeEventListener('keydown', onEscape)
    }
  },
  { immediate: true }
)

onUnmounted(() => document.removeEventListener('keydown', onEscape))

function fileType(name) {
  if (!name) return '文档'
  return name.endsWith('.yaml') || name.endsWith('.yml') ? '配置' : '文档'
}
</script>
