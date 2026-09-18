<template>
  <div class="bottom-bar">
    <div class="bottom-bar__left">
      <span class="bottom-bar__stat">
        项目: <strong>{{ activeProjectName }}</strong>
      </span>
    </div>
    <div class="bottom-bar__center">System Timeline · {{ store.statusMessage }}</div>
    <div class="bottom-bar__right">
      <span class="bottom-bar__stat">Running <strong>0</strong></span>
      <span class="bottom-bar__stat">Tasks <strong>{{ store.tasks.length }}</strong></span>
      <span class="bottom-bar__stat">v<strong>0.1.0</strong></span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { store } from '../stores/index.js'

const activeProjectName = computed(() => store.activeProject?.name || '未选择')
</script>
