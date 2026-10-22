<template>
  <svg
    class="icon"
    :class="iconClass"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="stageId === 'prepare'">
      <path d="M12 3v6" />
      <path d="m6.2 5.2 4.2 4.2" />
      <path d="M3 12h6" />
      <path d="m5.2 17.8 4.2-4.2" />
      <path d="M12 15v6" />
      <path d="m17.8 18.8-4.2-4.2" />
      <path d="M21 12h-6" />
      <path d="m18.8 6.2-4.2 4.2" />
    </template>
    <template v-else-if="stageId === 'proposal'">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </template>
    <template v-else-if="stageId === 'design'">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </template>
    <template v-else-if="stageId === 'tasks'">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </template>
    <template v-else-if="stageId === 'specs'">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </template>
    <template v-else-if="stageId === 'other'">
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </template>
    <template v-else>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </template>
  </svg>
</template>

<script setup>
defineProps({
  stageId: { type: String, required: true },
  iconClass: { type: String, default: 'icon--stage-nav' }
})
</script>
