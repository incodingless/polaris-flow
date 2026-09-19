<template>
  <aside class="primary-sidebar">
    <nav class="primary-nav">
      <div
        class="primary-nav-item"
        :class="{ active: activeNav === 'tasks' }"
        @click="$emit('nav', 'tasks')"
      >
        <span class="primary-nav-item__icon">
          <svg class="icon icon--nav" viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M9 21V9" />
          </svg>
        </span>
        <span class="primary-nav-item__label">任务</span>
      </div>
      <div
        class="primary-nav-item"
        :class="{ active: activeNav === 'config' }"
        @click="$emit('nav', 'config')"
      >
        <span class="primary-nav-item__icon">
          <svg class="icon icon--nav" viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6M8 13h8M8 17h8" />
          </svg>
        </span>
        <span class="primary-nav-item__label">配置</span>
      </div>
      <div
        class="primary-nav-item"
        :class="{ active: activeNav === 'archive' }"
        @click="$emit('nav', 'archive')"
      >
        <span class="primary-nav-item__icon">
          <svg class="icon icon--nav" viewBox="0 0 24 24">
            <path d="M21 8v13H3V8" />
            <path d="M1 3h22v5H1z" />
            <path d="M10 12h4" />
          </svg>
        </span>
        <span class="primary-nav-item__label">归档</span>
      </div>
      <div
        class="primary-nav-item"
        :class="{ active: activeNav === 'check' }"
        @click="$emit('nav', 'check')"
      >
        <span class="primary-nav-item__icon">
          <svg class="icon icon--nav" viewBox="0 0 24 24">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <path d="m9 11 3 3L22 4" />
          </svg>
        </span>
        <span class="primary-nav-item__label">检测</span>
      </div>
    </nav>
    <div class="primary-nav-bottom">
      <div class="primary-nav-item" title="项目设置" @click="$emit('settings')">
        <span class="primary-nav-item__icon">
          <svg class="icon icon--nav" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        </span>
        <span class="primary-nav-item__label">设置</span>
      </div>
      <div
        class="primary-nav-item"
        :title="collapsed ? '展开侧边栏' : '折叠侧边栏'"
        @click="$emit('toggle-collapse')"
      >
        <span class="primary-nav-item__icon">
          <svg v-if="collapsed" class="icon icon--nav" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg>
          <svg v-else class="icon icon--nav" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>
        </span>
        <span class="primary-nav-item__label">{{ collapsed ? '展开' : '折叠' }}</span>
      </div>
    </div>
  </aside>
</template>

<script setup>
defineProps({
  collapsed: { type: Boolean, default: false },
  activeNav: { type: String, default: 'tasks' }
})

defineEmits(['nav', 'settings', 'toggle-collapse'])
</script>
