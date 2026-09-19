<template>
  <div
    v-if="visible"
    class="modal-overlay"
    @click.self="$emit('close')"
    @keydown.escape="$emit('close')"
  >
    <div class="modal">
      <div class="modal__header">
        <div class="modal__header-icon">
          <svg class="icon" viewBox="0 0 24 24">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <div class="modal__header-info">
          <div class="modal__title">项目选择器</div>
          <div class="modal__desc">切换到其他项目或添加新项目</div>
        </div>
        <button class="modal__close" @click="$emit('close')">✕</button>
      </div>
      <div class="modal__body">
        <div class="modal__section-title">你的项目</div>
        <div
          v-if="projects.length === 0"
          style="text-align:center;padding:var(--spacing-24);color:var(--text-helper);"
        >
          暂无项目
        </div>
        <div
          v-for="proj in projects"
          :key="proj.id"
          class="project-item"
          :class="{
            'project-item--active': proj.id === activeId,
            'project-item--stale': proj.stale
          }"
          :title="proj.stale ? `失效：${proj.reason}（请删除后重新添加）` : proj.path"
          @click="!proj.stale && $emit('select', proj)"
        >
          <div class="project-item__icon">
            <svg class="icon" viewBox="0 0 24 24">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div class="project-item__info">
            <div class="project-item__name">
              {{ proj.name }}
              <!-- 失效项可见但不自动清理：删除只能是用户的动作 -->
              <span v-if="proj.stale" class="badge badge--stale" :title="proj.reason">失效</span>
            </div>
            <div class="project-item__path">{{ proj.path }}</div>
            <div v-if="proj.stale" class="project-item__stale-reason">{{ proj.reason }}</div>
          </div>
          <div class="project-item__actions" @click.stop>
            <span v-if="proj.id === defaultProjectId" class="badge badge--modal-default">
              默认
              <svg class="badge__check" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </span>
            <button
              v-else
              type="button"
              class="btn btn--sm btn--ghost project-item__set-default"
              :disabled="proj.stale"
              :title="proj.stale ? '失效项目不能设为默认' : ''"
              @click="$emit('set-default', proj)"
            >
              设为默认
            </button>
            <button
              type="button"
              class="btn btn--sm btn--danger-ghost project-item__delete"
              :disabled="removingProjectId === proj.id"
              @click="requestRemove(proj)"
            >
              {{ removingProjectId === proj.id ? '移除中...' : '删除' }}
            </button>
          </div>
        </div>
      </div>
      <div class="modal__footer">
        <button type="button" class="modal__footer-cta" @click="$emit('add')">
          + 添加新项目
        </button>
      </div>
    </div>

    <div
      v-if="confirmTarget"
      class="confirm-overlay"
      @click.self="cancelRemove"
    >
      <div class="confirm-box">
        <div class="confirm-box__title">移除项目</div>
        <div class="confirm-box__msg">
          确定从 Polaris 中移除项目「{{ confirmTarget.name }}」？<br />
          <span class="confirm-box__path">{{ confirmTarget.path }}</span><br />
          本地目录不会被删除，可随时重新添加。
        </div>
        <div class="confirm-box__actions">
          <button type="button" class="btn btn--ghost" @click="cancelRemove">取消</button>
          <button
            type="button"
            class="btn btn--danger"
            :disabled="!!removingProjectId"
            @click="confirmRemove"
          >
            {{ removingProjectId ? '移除中...' : '移除' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  projects: { type: Array, default: () => [] },
  activeId: { type: String, default: '' },
  defaultProjectId: { type: String, default: '' },
  removingProjectId: { type: String, default: '' }
})

const emit = defineEmits(['close', 'select', 'add', 'set-default', 'delete'])

const confirmTarget = ref(null)

watch(() => props.removingProjectId, (id) => {
  if (!id) confirmTarget.value = null
})

watch(() => props.visible, (open) => {
  if (!open) confirmTarget.value = null
})

function requestRemove(proj) {
  confirmTarget.value = proj
}

function cancelRemove() {
  if (props.removingProjectId) return
  confirmTarget.value = null
}

function confirmRemove() {
  if (!confirmTarget.value || props.removingProjectId) return
  emit('delete', confirmTarget.value)
}
</script>
