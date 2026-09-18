<template>
  <div
    v-if="visible"
    class="modal-overlay"
    @click.self="$emit('close')"
    @keydown.escape="$emit('close')"
  >
    <div class="modal modal--wide">
      <div class="modal__header">
        <div class="modal__header-icon">
          <svg class="icon" viewBox="0 0 24 24">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            <path d="M12 11v6M9 14h6" />
          </svg>
        </div>
        <div class="modal__header-info">
          <div class="modal__title">添加项目</div>
          <div class="modal__desc">浏览已经包含 openspec/ 文件夹的仓库</div>
        </div>
        <button class="modal__close" @click="$emit('close')">✕</button>
      </div>
      <div class="modal__body">
        <div class="notice-box">
          需要新项目？请先安装 OpenSpec，并在仓库中运行 <code>openspec init</code><br />
          <a href="#">安装 OpenSpec</a> &nbsp;·&nbsp; <a href="#">CLI 设置指南</a>
        </div>
        <div class="breadcrumb">
          <span class="breadcrumb__home" title="根目录" @click="$emit('nav-root')">
            <svg class="icon icon--sm" viewBox="0 0 24 24">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
          </span>
          <template v-for="(seg, i) in browsePath" :key="i">
            <span class="breadcrumb__sep">/</span>
            <span
              class="breadcrumb__seg"
              :class="{ current: i === browsePath.length - 1 }"
              @click="$emit('nav-breadcrumb', i)"
            >{{ seg }}</span>
          </template>
        </div>
        <div class="dir-list">
          <div
            v-for="dir in dirList"
            :key="dir.path"
            class="dir-item"
            @click="$emit('enter-dir', dir)"
          >
            <span class="dir-item__icon">
              <svg class="icon icon--sm" viewBox="0 0 24 24">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </span>
            <span class="dir-item__name">{{ dir.name }}</span>
            <span class="dir-item__arrow">
              <svg class="icon icon--sm" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>
            </span>
          </div>
        </div>
        <p v-if="error" class="text-error">{{ error }}</p>
      </div>
      <div class="modal__footer">
        <div class="modal__path-hint">当前路径: {{ currentPath }}</div>
        <button
          type="button"
          class="btn--modal-cta"
          :disabled="!hasOpenspec"
          @click="$emit('confirm')"
        >
          {{ hasOpenspec ? 'Add This Directory 添加此目录' : '该目录未初始化 OpenSpec' }}
        </button>
        <div class="path-input-row">
          <span class="path-input-row__toggle" @click="showManual = !showManual">或手动输入路径</span>
        </div>
        <div v-if="showManual" class="path-input-row">
          <input
            v-model="manualPathLocal"
            class="path-input"
            placeholder="/path/to/project"
            @keydown.enter="submitManualPath"
          />
          <button class="btn" :disabled="!canValidatePath" @click="submitManualPath">验证</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  browsePath: { type: Array, default: () => [] },
  dirList: { type: Array, default: () => [] },
  currentPath: { type: String, default: '' },
  hasOpenspec: { type: Boolean, default: false },
  error: { type: String, default: '' },
  manualPath: { type: String, default: '' }
})

const emit = defineEmits(['close', 'nav-root', 'nav-breadcrumb', 'enter-dir', 'confirm', 'validate'])

const showManual = ref(false)
const manualPathLocal = ref(props.manualPath)
const canValidatePath = computed(() => !!manualPathLocal.value.trim())

watch(() => props.manualPath, (val) => {
  manualPathLocal.value = val
})

function submitManualPath() {
  if (!canValidatePath.value) return
  emit('validate', manualPathLocal.value)
}
</script>
