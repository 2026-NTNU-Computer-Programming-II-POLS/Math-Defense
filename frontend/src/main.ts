//                       _ooOoo_
//                      o8888888o
//                      88" . "88
//                      (| -_- |)
//                      O\  =  /O
//                   ____/`---'\____
//                 .'  \\|     |//  `.
//                /  \\|||  :  |||//  \
//               /  _||||| -:- |||||-  \
//               |   | \\\  -  /// |   |
//               | \_|  ''\---/''  |   |
//               \  .-\__  `-`  ___/-. /
//             ___`. .'  /--.--\  `. . __
//          ."" '<  `.___\_<|>_/___.'  >'"".
//         | | :  `- \`.;`\ _ /`;.`/ - ` : | |
//         \  \ `-.   \_ __\ /__ _/   .-` /  /
//     =====`-.____`.___ \_____/___.-`____.-'=====
//                       `=---='
//
//        Buddha bless this app — may it boot bug-free.

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from '@/router'
import App from './App.vue'
import '@/styles/global.css'
import { useAuthStore } from '@/stores/authStore'
import { initWasm, isUsingWasm } from '@/math/WasmBridge'

async function bootstrap() {
  const app = createApp(App)
  app.use(createPinia())
  app.use(router)

  // construction plan §3.8 — kick off the WASM determinism module load at app
  // boot so LevelSelectView / TerritoryDetailView can pick up the v2 level
  // generator without a UI hop waiting for WASM. Fire-and-forget; views
  // await readiness via whenWasmReady() before deciding v1 vs v2.
  //
  // construction plan §5 — log the resolved replay-version capability in dev so
  // a silently-broken .wasm download (404, mime mismatch, COEP/COOP block)
  // surfaces as a console line instead of "everything still works but every
  // session ends up tagged v1." Production builds skip the log; the
  // [WasmBridge] line emitted by initWasm itself is enough.
  initWasm()
    .then((ok) => {
      if (import.meta.env.DEV) {
        const v2 = ok && isUsingWasm()
        console.log(
          `[boot] WASM determinism module: ${v2 ? 'loaded' : 'unavailable'}, `
            + `replay v2 supported = ${v2}`,
        )
      }
    })
    .catch(() => { /* logged inside initWasm; v1 fallback is fine */ })

  // Probe /auth/me (cookie-based) to restore user session before mounting
  const authStore = useAuthStore()
  await authStore.init()

  app.mount('#app')
}

bootstrap()
