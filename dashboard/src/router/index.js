import { createRouter, createWebHashHistory } from 'vue-router'

import HomePage from '../views/HomePage.vue'
import ProjectsPage from '../views/ProjectsPage.vue'
import TasksPage from '../views/TasksPage.vue'
import ConfigPage from '../views/ConfigPage.vue'
import CheckPage from '../views/CheckPage.vue'

const routes = [
  { path: '/', redirect: '/home' },
  { path: '/home', name: 'home', component: HomePage },  
  { path: '/tasks', name: 'tasks', component: TasksPage },
  { path: '/config', name: 'config', component: ConfigPage },
  { path: '/check', name: 'check', component: CheckPage }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
