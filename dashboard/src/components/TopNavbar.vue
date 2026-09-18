<template>
  <nav class="top-navbar">
    <div class="top-navbar__left">
      <div class="top-navbar__brand">
        <img
          class="top-navbar__logo"
          src="/resources/logo.png"
          alt="Polaris"
          width="30"
          height="30"
        />
        <span class="top-navbar__brand-name">Polaris Buddy</span>
      </div>
    </div>
    <div class="top-navbar__center"></div>
    <div class="top-navbar__right">
      <router-link to="/home" class="top-nav-btn" active-class="active">首页</router-link>
      <router-link to="/tasks" class="top-nav-btn" active-class="active">任务</router-link>
      <button
        type="button"
        class="top-nav-btn top-nav-btn--icon"
        :title="store.theme === 'dark' ? '切换为明亮模式' : '切换为黑暗模式'"
        :aria-label="store.theme === 'dark' ? '切换为明亮模式' : '切换为黑暗模式'"
        @click="toggleTheme"
      >
        <svg v-if="store.theme === 'dark'" class="icon icon--nav" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
        <svg v-else class="icon icon--nav" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </button>
      <router-link
        to="/config"
        class="top-nav-btn top-nav-btn--icon"
        active-class="active"
        title="设置"
        aria-label="设置"
      >
        <svg class="icon icon--nav" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </router-link>
    </div>
  </nav>
</template>

<script setup>
import { store } from '../stores/index.js'
import { toggleTheme } from '../utils/theme.js'
</script>
