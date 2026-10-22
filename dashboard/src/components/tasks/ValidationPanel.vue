<template>
  <div class="validation-panel">
    <div class="validation-panel__header">
      <div class="validation-panel__title-row">
        <h3 class="validation-panel__title">计划校验</h3>
        <span v-if="pass === true" class="tag tag-success">全部通过</span>
        <span v-else-if="pass === false" class="tag tag-warning">存在问题</span>
        <span v-else-if="result" class="tag tag-outline">无可校验文件</span>
      </div>
      <button
        type="button"
        class="btn btn--sm"
        :disabled="validating"
        @click="$emit('revalidate')"
      >
        {{ validating ? '校验中...' : '重新校验' }}
      </button>
    </div>

    <div v-if="validating" class="validation-panel__loading">正在运行 tasks-lint...</div>

    <div v-else-if="error" class="validation-panel__error">
      <p>校验失败：{{ error }}</p>
      <button type="button" class="btn btn--sm" @click="$emit('revalidate')">重试</button>
    </div>

    <template v-else-if="result">
      <p v-if="result.file" class="validation-panel__file">
        校验对象：<code>{{ result.file }}</code>
      </p>

      <!-- pass 为 null 是「没有可校验的计划文件」，不是校验失败：不摆红叉，只说明原因 -->
      <div v-if="pass === null" class="validation-panel__empty">
        {{ result.reason || '该任务没有可校验的计划文件' }}
      </div>

      <ul v-else-if="violations.length" class="validate-list">
        <li
          v-for="(item, idx) in violations"
          :key="idx"
          class="validate-item validate-item--error"
        >
          <span class="validate-item__status">✗</span>
          <div class="validate-item__body">
            <p class="validate-issue__message">{{ item }}</p>
          </div>
        </li>
      </ul>

      <div v-else class="validation-panel__empty">未发现问题</div>
    </template>

    <div v-else class="validation-panel__empty">点击「重新校验」开始校验</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

/**
 * 计划校验面板。
 *
 * 数据来自 `GET /api/tasks/:id/plan-lint`（只读，转调 CLI 的 `tasks-lint`）：
 * `{ pass: boolean|null, violations: string[], file: string, reason: string }`。
 *
 * 与 M1/M2 之前的版本的区别：旧版吃的是 `openspec validate` 的
 * `{ valid, items[], summary.totals }` 结构，那个端点在 M2 已下线（依赖外部
 * openspec CLI），所以整个面板改了形状 —— `pass: null` 表示「没有可校验的
 * 计划文件」，与「校验失败」必须分开显示，否则会把无事可做渲染成红叉。
 */
const props = defineProps({
  validating: { type: Boolean, default: false },
  result: { type: Object, default: null },
  error: { type: String, default: '' }
})

defineEmits(['revalidate'])

const pass = computed(() => (props.result ? props.result.pass : null))
const violations = computed(() => props.result?.violations || [])
</script>

<style scoped>
.validation-panel__file {
  margin: 0 0 8px;
  font-size: 12px;
  opacity: 0.75;
}
</style>
