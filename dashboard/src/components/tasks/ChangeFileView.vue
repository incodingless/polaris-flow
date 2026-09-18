<template>
  <div class="change-file-view">
    <div v-if="!file" class="change-file-view__empty">暂无文件</div>
    <template v-else>
      <div v-if="showHeader" class="change-file-view__header">
        <h2>{{ displayName }}</h2>
        <span v-if="file.path && file.path !== file.name" class="change-file-view__path">{{ file.path }}</span>
      </div>
      <div
        v-if="isMarkdown"
        class="markdown-view change-file-view__markdown"
        v-html="renderedHtml"
      ></div>
      <pre v-else class="change-file-view__raw"><code>{{ file.content || '（空文件）' }}</code></pre>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { fileDisplayName } from '../../utils/changeFiles.js'
import { isMarkdownFile, renderMarkdown } from '../../utils/markdown.js'

const props = defineProps({
  file: { type: Object, default: null },
  showHeader: { type: Boolean, default: true }
})

const displayName = computed(() => fileDisplayName(props.file))
const isMarkdown = computed(() => isMarkdownFile(props.file))
const renderedHtml = computed(() => renderMarkdown(props.file?.content || ''))
</script>

<style scoped>
.change-file-view {
  height: 100%;
  min-height: 0;
}

.change-file-view__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-helper);
  font-size: 14px;
}

.change-file-view__header {
  margin-bottom: var(--spacing-16);
}

.change-file-view__header h2 {
  margin: 0 0 4px;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
}

.change-file-view__path {
  font-size: 12px;
  color: var(--text-helper);
  font-family: var(--font-mono);
}

.change-file-view__markdown {
  min-height: 0;
  overflow-y: auto;
  height: 100%;
  padding: var(--spacing-24);
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  line-height: 1.8;
}

.change-file-view__raw {
  margin: 0;
  padding: var(--spacing-12);
  background: var(--bg-global);
  border-radius: var(--radius-md);
  overflow: auto;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.change-file-view__raw code {
  font-family: var(--font-mono);
  color: var(--text-primary);
}
</style>
