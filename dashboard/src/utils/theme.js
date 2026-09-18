import { store } from '../stores/index.js'

const THEME_KEY = 'polaris-theme'

/** 应用主题到 document 并持久化 */
export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  store.theme = theme
  localStorage.setItem(THEME_KEY, theme)

  let meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  meta.content = theme === 'light' ? '#FFFFFF' : '#121212'
}

/** 从 localStorage 恢复主题（应用启动时调用） */
export function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'dark'
  applyTheme(saved)
}

/** 在明亮 / 黑暗模式间切换 */
export function toggleTheme() {
  const next = store.theme === 'dark' ? 'light' : 'dark'
  applyTheme(next)
}
