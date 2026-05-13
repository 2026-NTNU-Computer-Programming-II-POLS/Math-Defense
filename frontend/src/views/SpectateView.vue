<script setup lang="ts">
/**
 * SpectateView — Pedagogical Backlog §24 Phase D live spectate.
 *
 * Connects to the per-session WebSocket, applies the historical snapshot,
 * then dispatches subsequent live events as they arrive. Unlike ReplayView,
 * playback is driven by the live event stream (no scrub) and the "engine"
 * here is a slim re-emit shell — we don't run the simulation locally
 * because it would diverge from the live run on any tiny timing drift.
 * Instead we mirror only HUD-relevant state changes for the viewer.
 *
 * NOTE: this is a minimal v1. A polished spectate experience would re-run
 * the simulation engine in lock-step (deterministic given seed + events),
 * which would let the spectator see projectiles and enemies — not just
 * HUD-mirrored numbers. That's a Phase D extension.
 */
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { SpectatorClient, type SpectateSnapshot } from '@/engine/replay/SpectatorClient'
import type { ReplayEventOut } from '@/services/sessionService'
import { Events } from '@/data/constants'

const route = useRoute()
const router = useRouter()

const status = ref<'connecting' | 'live' | 'closed' | 'error' | 'auth' | 'forbidden'>('connecting')
const snapshot = ref<SpectateSnapshot | null>(null)
const eventCount = ref(0)
const lastEvent = ref<ReplayEventOut | null>(null)
const wave = ref(0)
const towers = ref<string[]>([])

const sessionId = computed(() => String(route.params.sessionId ?? ''))

let client: SpectatorClient | null = null

function applyEvent(e: ReplayEventOut): void {
  eventCount.value += 1
  lastEvent.value = e
  // Cheap HUD-mirror: only the events the viewer needs to see "live state"
  // are projected into reactive refs. Full simulation re-run is a future
  // enhancement (see file header).
  if (e.event_type === Events.WAVE_START && typeof e.payload === 'number') {
    wave.value = e.payload
  } else if (e.event_type === Events.TOWER_PLACED) {
    const id = (e.payload as { id?: string } | null)?.id
    if (id) towers.value = [...towers.value, id]
  } else if (e.event_type === Events.TOWER_REMOVED) {
    const id = (e.payload as { towerId?: string } | null)?.towerId
    if (id) towers.value = towers.value.filter((t) => t !== id)
  } else if (e.event_type === Events.LEVEL_END || e.event_type === Events.GAME_OVER) {
    status.value = 'closed'
  }
}

onMounted(() => {
  client = new SpectatorClient(sessionId.value, {
    onSnapshot: (s) => {
      snapshot.value = s
      // Replay snapshot history into the same applyEvent path so the HUD
      // mirror starts in sync with whatever has already happened in the
      // live run.
      for (const e of s.events) applyEvent(e)
      status.value = 'live'
    },
    onEvent: applyEvent,
    onClose: (_code, _reason, classification) => {
      if (classification === 'auth') status.value = 'auth'
      else if (classification === 'forbidden') status.value = 'forbidden'
      else if (classification === 'normal') status.value = 'closed'
      else status.value = 'closed'
    },
    onError: () => { status.value = 'error' },
  })
  client.start()
})

onBeforeUnmount(() => {
  client?.destroy()
  client = null
})

function exit(): void {
  router.push({ name: 'menu' }).catch(() => { /* swallow */ })
}
</script>

<template>
  <div class="spectate-view">
    <header class="header">
      <h1>Live Spectate</h1>
      <span class="status" :data-status="status">{{ status }}</span>
      <button class="btn-ghost" @click="exit">Exit</button>
    </header>

    <main class="body">
      <p v-if="status === 'connecting'">Connecting…</p>
      <p v-else-if="status === 'error'" class="err">Connection error.</p>
      <p v-else-if="status === 'auth'" class="err">Sign-in required to spectate this session.</p>
      <p v-else-if="status === 'forbidden'" class="err">You don't have permission to spectate this session.</p>
      <p v-else-if="status === 'closed'">Session ended.</p>

      <section class="hud" v-if="snapshot">
        <div><strong>Star:</strong> {{ snapshot.star_rating }}</div>
        <div><strong>Wave:</strong> {{ wave }}</div>
        <div><strong>Towers placed:</strong> {{ towers.length }}</div>
        <div><strong>Events received:</strong> {{ eventCount }}</div>
      </section>

      <section class="last-event" v-if="lastEvent">
        <h3>Last event</h3>
        <code>{{ lastEvent.event_type }}</code>
        <span>at t={{ lastEvent.ts.toFixed(2) }}s</span>
      </section>
    </main>
  </div>
</template>

<style scoped>
.spectate-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--stone-dark);
  color: var(--text-primary);
  padding: 1rem;
}
.header {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.header h1 { font-size: 1.1rem; margin: 0; }
.status {
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  font-size: 0.8rem;
  background: var(--stone-light);
}
.status[data-status="live"] { color: #6cc44a; }
.status[data-status="error"] { color: var(--hp-red); }
.btn-ghost {
  margin-left: auto;
  padding: 0.4rem 0.9rem;
  background: transparent;
  color: var(--axis);
  border: 1px solid var(--grid-line);
  border-radius: 4px;
  cursor: pointer;
}
.body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 1rem;
}
.hud {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
}
.last-event {
  padding: 0.5rem;
  background: var(--stone-light);
  border-radius: 4px;
}
.err { color: var(--hp-red); }
</style>
