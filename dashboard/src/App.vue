<template>
  <div id="app-shell" class="app-shell">
    <TopNavbar />
    <main class="main-content">
      <router-view />
    </main>
    <BottomStatusBar />
    <AppToast />
  </div>
</template>

<script setup>
import TopNavbar from './components/TopNavbar.vue'
import BottomStatusBar from './components/BottomStatusBar.vue'
import AppToast from './components/AppToast.vue'
</script>
