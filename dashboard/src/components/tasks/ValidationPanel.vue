<template>
  <div class="validation-panel">
    <div class="validation-panel__header">
      <div class="validation-panel__title-row">
        <h3 class="validation-panel__title">结构检测</h3>
        <span
          v-if="result && result.valid"
          class="tag tag-success"
        >全部通过</span>
        <span
          v-else-if="result && !result.valid"
          class="tag tag-warning"
        >存在问题</span>
      </div>
      <button
        type="button"
        class="btn btn--sm"
        :disabled="validating"
        @click="$emit('revalidate')"
      >
        {{ validating ? '检测中...' : '重新检测' }}
      </button>
    </div>

    <div v-if="validating" class="validation-panel__loading">正在运行 openspec validate...</div>

    <div v-else-if="error" class="validation-panel__error">
      <p>检测失败：{{ error }}</p>
      <button type="button" class="btn btn--sm" @click="$emit('revalidate')">重试</button>
    </div>

    <template v-else-if="result">
      <div class="validation-panel__summary">
        <span
          class="validate-summary validate-summary--ok"
        >通过 {{ passedCount }}</span>
        <span
          class="validate-summary validate-summary--error"
        >未通过 {{ failedCount }}</span>
      </div>

      <ul v-if="items.length" class="validate-list">
        <li
          v-for="item in items"
          :key="item.id"
          class="validate-item"
          :class="item.valid ? 'validate-item--ok' : 'validate-item--error'"
        >
          <span class="validate-item__status">{{ item.valid ? '✓' : '✗' }}</span>
          <div class="validate-item__body">
            <ul v-if="item.issues?.length" class="validate-issue-list">
              <li
                v-for="(issue, idx) in item.issues"
                :key="idx"
                class="validate-issue"
                :class="'validate-issue--' + (issue.level || 'error').toLowerCase()"
              >
                <span class="validate-issue__level">{{ issue.level || 'ERROR' }}</span>
                <span v-if="issue.path" class="validate-issue__path">{{ formatIssuePath(issue.path) }}</span>
                <p class="validate-issue__message">{{ issue.message }}</p>
              </li>
            </ul>
            <p v-else-if="item.valid" class="validate-item__ok-text">校验通过</p>
          </div>
        </li>
      </ul>

      <div v-else class="validation-panel__empty">暂无校验项</div>
    </template>

    <div v-else class="validation-panel__empty">点击「重新检测」开始校验</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  validating: { type: Boolean, default: false },
  result: { type: Object, default: null },
  error: { type: String, default: '' }
})

defineEmits(['revalidate'])

const items = computed(() => {
  const all = props.result?.items || []
  const changeName = props.result?.changeName
  if (!changeName) return all
  return all.filter((item) => item.id === changeName)
})

const passedCount = computed(() =>
  props.result?.summary?.totals?.passed
  ?? items.value.filter((item) => item.valid).length
)

const failedCount = computed(() =>
  props.result?.summary?.totals?.failed
  ?? items.value.filter((item) => !item.valid).length
)

/** 格式化 issue 路径，避免 capability 名被误认为其他变更 */
function formatIssuePath(path) {
  if (!path || path === 'file') return '变更整体'
  if (path.includes('/')) return `specs/${path}`
  return path
}
</script>
