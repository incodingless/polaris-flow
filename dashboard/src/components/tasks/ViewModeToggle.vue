<template>
  <div class="view-mode-toggle" role="tablist" aria-label="视图模式">
    <button
      type="button"
      class="view-mode-toggle__option"
      :class="{ 'view-mode-toggle__option--active': modelValue === 'preview' }"
      role="tab"
      :aria-selected="modelValue === 'preview'"
      @click="$emit('update:modelValue', 'preview')"
    >
      预览
    </button>
    <button
      type="button"
      class="view-mode-toggle__option"
      :class="{ 'view-mode-toggle__option--active': modelValue === 'source' }"
      role="tab"
      :aria-selected="modelValue === 'source'"
      @click="$emit('update:modelValue', 'source')"
    >
      源文件
    </button>
  </div>
</template>

<script setup>
defineProps({
  modelValue: { type: String, default: 'preview' }
})

defineEmits(['update:modelValue'])
</script>
