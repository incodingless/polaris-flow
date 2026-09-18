<template>
  <div class="spec-content-panel">
    <div v-if="loading" class="spec-content-panel__empty">加载中...</div>
    <div v-else-if="!file" class="spec-content-panel__empty">
      <p>请从左侧选择规格文件</p>
    </div>
    <div v-else class="spec-content-panel__body">
      <div class="spec-content-panel__header">
        <h2>{{ file.name }}</h2>
        <span class="spec-content-panel__path">{{ file.path }}</span>
      </div>
      <pre class="spec-content-panel__code"><code>{{ content || '（空文件）' }}</code></pre>
    </div>
  </div>
</template>

<script setup>
defineProps({
  file: { type: Object, default: null },
  content: { type: String, default: '' },
  loading: { type: Boolean, default: false }
})
</script>

<style scoped>
.spec-content-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.spec-content-panel__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-helper);
  font-size: 14px;
}

.spec-content-panel__body {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  padding: var(--space-lg);
}

.spec-content-panel__header {
  margin-bottom: var(--space-md);
}

.spec-content-panel__header h2 {
  margin: 0 0 4px;
  font-size: 18px;
  font-weight: 700;
}

.spec-content-panel__path {
  font-size: 12px;
  color: var(--text-helper);
  font-family: var(--font-mono, monospace);
}

.spec-content-panel__code {
  flex: 1;
  overflow: auto;
  margin: 0;
  padding: var(--space-md);
  background: var(--bg-card);
  border: 1px solid var(--border-normal);
  border-radius: var(--radius-md);
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
