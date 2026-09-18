import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { initTheme } from './utils/theme.js'
import './assets/styles/global.css'
import './assets/styles/component.css'
import './assets/styles/main.css'
import './assets/styles/tasks.css'
import './assets/styles/dashboard.css'

initTheme()

const app = createApp(App)
app.use(router)
app.mount('#app')
