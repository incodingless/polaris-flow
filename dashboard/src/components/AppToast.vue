<template>
  <div
    v-if="store.toast.show"
    class="app-toast"
  >
    {{ store.toast.message }}
  </div>
</template>

<script setup>
import { store } from '../stores/index.js'
</script>

<style scoped>
.app-toast {
  position: fixed;
  bottom: 48px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-card);
  color: var(--text-primary);
  padding: 10px 24px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-normal);
  z-index: 400;
  font-size: 13px;
  box-shadow: var(--shadow-card);
}
</style>
