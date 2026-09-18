<template>
  <div class="mini-progress">
    <div class="mini-progress-bar" :style="{ width: percent + '%' }"></div>
  </div>
</template>

<script setup>
defineProps({
  percent: { type: Number, default: 0 }
})
</script>
