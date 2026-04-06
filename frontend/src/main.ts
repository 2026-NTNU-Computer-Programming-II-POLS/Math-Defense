import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from '@/router'
import App from './App.vue'
import '@/styles/global.css'
import { useAuthStore } from '@/stores/authStore'

async function bootstrap() {
  const app = createApp(App)
  app.use(createPinia())
  app.use(router)

  // Validate stored token and restore user before mounting
  const authStore = useAuthStore()
  await authStore.init()

  app.mount('#app')
}

bootstrap()
