<template>
  <article
    class="dashboard-activity-card card"
    role="button"
    tabindex="0"
    @click="$emit('select', item.id)"
    @keydown.enter="$emit('select', item.id)"
  >
    <h3 class="dashboard-activity-card__title">{{ item.title }}</h3>
    <time class="dashboard-activity-card__time">{{ item.updatedAt }}</time>
    <div class="dashboard-activity-card__stats">
      <span>{{ item.specCount }} 产物</span>
      <span class="dashboard-activity-card__divider">/</span>
      <span>{{ item.taskStats }} 任务</span>
    </div>
  </article>
</template>

<script setup>
defineProps({
  item: { type: Object, required: true }
})

defineEmits(['select'])
</script>
