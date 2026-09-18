<template>
  <div class="page check-page">
    <div class="check-page__header">
      <h2>环境检测</h2>
      <p v-if="projectName" class="check-page__project">项目：{{ projectName }}</p>
    </div>

    <div v-if="!projectName" class="check-page__empty">
      <p>请先在任务页选择项目</p>
      <router-link to="/tasks" class="btn btn--primary">前往任务页</router-link>
    </div>

    <div v-else-if="loading" class="check-page__loading">正在运行检测...</div>

    <div v-else-if="error" class="check-page__error">
      <p>检测失败：{{ error }}</p>
      <button class="btn" @click="runCheck">重试</button>
    </div>

    <template v-else-if="results">
      <div class="check-page__summary">
        <span class="check-summary check-summary--ok">通过 {{ results.summary.ok }}</span>
        <span class="check-summary check-summary--warn">警告 {{ results.summary.warn }}</span>
        <span class="check-summary check-summary--error">错误 {{ results.summary.error }}</span>
        <button class="btn btn--sm" @click="runCheck">重新检测</button>
      </div>
      <ul class="check-list">
        <li
          v-for="item in results.checks"
          :key="item.name"
          class="check-item"
          :class="'check-item--' + item.status"
        >
          <span class="check-item__status">{{ statusLabel(item.status) }}</span>
          <div class="check-item__body">
            <strong>{{ item.name }}</strong>
            <p>{{ item.description }}</p>
          </div>
        </li>
      </ul>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { store } from '../stores/index.js'
import { fetchCheck } from '../api/index.js'

const loading = ref(false)
const error = ref('')
const results = ref(null)

const projectName = computed(() => store.activeProject?.name || '')

function statusLabel(status) {
  const map = { ok: '✓', warn: '!', error: '✗' }
  return map[status] || '?'
}

async function runCheck() {
  if (!store.activeProject) return
  loading.value = true
  error.value = ''
  const { data, error: err } = await fetchCheck(store.activeProject)
  loading.value = false
  if (err) {
    error.value = err
    results.value = null
    return
  }
  results.value = data
  store.checkResults = data
}

onMounted(runCheck)
</script>

<style scoped>
.check-page {
  padding: var(--space-xl, 24px);
  max-width: 800px;
}

.check-page__header h2 {
  margin: 0 0 4px;
  font-size: 20px;
}

.check-page__project {
  margin: 0 0 20px;
  font-size: 13px;
  color: var(--text-helper);
}

.check-page__empty,
.check-page__loading,
.check-page__error {
  padding: 40px 0;
  color: var(--text-helper);
}

.check-page__summary {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.check-summary {
  font-size: 13px;
  padding: 4px 10px;
  border-radius: 999px;
}

.check-summary--ok { background: var(--badge-success-bg); color: var(--badge-success-text); }
.check-summary--warn { background: var(--badge-warning-bg); color: var(--badge-warning-text); }
.check-summary--error { background: var(--badge-error-bg); color: var(--badge-error-text); }

.check-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.check-item {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-normal);
  border-radius: var(--radius-md);
}

.check-item__status {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 700;
}

.check-item--ok .check-item__status { background: var(--badge-success-bg); color: var(--badge-success-text); }
.check-item--warn .check-item__status { background: var(--badge-warning-bg); color: var(--badge-warning-text); }
.check-item--error .check-item__status { background: var(--badge-error-bg); color: var(--badge-error-text); }

.check-item__body strong {
  display: block;
  margin-bottom: 4px;
}

.check-item__body p {
  margin: 0;
  font-size: 13px;
  color: var(--text-helper);
}
</style>
