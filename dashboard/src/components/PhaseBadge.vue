<template>
  <span class="phase-badge">{{ phase }}</span>
</template>

<script setup>
defineProps({
  phase: { type: String, default: '' }
})
</script>
