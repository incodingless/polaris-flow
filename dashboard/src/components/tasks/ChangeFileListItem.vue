<template>
  <div
    class="file-item"
    :class="{
      active,
      'file-item--static': !selectable,
      'file-item--tab': layout === 'tab'
    }"
    @click="onSelect"
  >
    <span class="file-item__icon">
      <svg class="icon icon--sm" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
      </svg>
    </span>
    <span class="file-item__name">{{ name }}</span>
    <button
      type="button"
      class="file-item__refresh"
      title="刷新"
      :aria-label="refreshing ? '刷新中' : '刷新'"
      :disabled="refreshing"
      @click.stop="$emit('refresh')"
    >
      <svg
        class="icon icon--sm file-item__refresh-icon"
        :class="{ 'file-item__refresh-icon--spin': refreshing }"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M21 12a9 9 0 1 1-3-6.7" />
        <path d="M21 3v6h-6" />
      </svg>
    </button>
  </div>
</template>

<script setup>
const props = defineProps({
  name: { type: String, required: true },
  active: { type: Boolean, default: false },
  refreshing: { type: Boolean, default: false },
  /** list：纵向列表项；tab：顶部横向页签 */
  layout: { type: String, default: 'list' },
  /** 是否可点击整行切换选中（单文件顶栏为 false） */
  selectable: { type: Boolean, default: true }
})

const emit = defineEmits(['select', 'refresh'])

function onSelect() {
  if (!props.selectable) return
  emit('select')
}
</script>
