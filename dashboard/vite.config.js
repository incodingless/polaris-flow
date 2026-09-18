import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // 相对 base：产物可被任意路径前缀下的静态托管直接服务
  base: './',
  plugins: [vue()],
  build: {
    // 由根目录 build.js 统一驱动构建，产物落 dist/web
    //（与后端 tsc 输出 dist/dashboard/* 同级，不混层）
    outDir: '../dist/web',
    emptyOutDir: true
  },
  server: {
    // 仅供「polaris dashboard --api-only」+ npm run dev 的 HMR 开发态使用
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3700',
        changeOrigin: true
      }
    }
  }
})
