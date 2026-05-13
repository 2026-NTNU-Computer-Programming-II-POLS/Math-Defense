import { api } from './api'

export interface SessionOut {
  schema_version: 1
  id: string
  star_rating: number
  status: string
  current_wave: number
  gold: number
  hp: number
  score: number
  started_at: string
  ended_at?: string
  newly_unlocked_achievements?: { id: string; talent_points: number }[]
  // Rolling Initial-Answer accuracy (0.0–1.0) over the last 10 completed
  // sessions. Read at level start by the curve renderer to fade y-axis
  // labels (concrete-fading, spec §17).
  ia_recent_accuracy?: number
  // Backlog §20 — true when the run was created with the slider-fallback
  // toggle on. The HUD renders a "Practice mode — leaderboard ineligible"
  // badge and the ScoreResult view shows a notice.
  practice_mode?: boolean
  // Backlog §23 — non-null when this session was launched from a teacher-
  // authored challenge deep-link. The ScoreResult view links back to the
  // challenge-specific leaderboard instead of the global one.
  challenge_id?: string | null
  // Backlog §24 — per-session deterministic seed echoed back from the server
  // (the value the client posted at create time). The Replay player feeds
  // this into Game.setSeed before re-driving the engine against the stored
  // event log.
  rng_seed?: number | null
  // construction plan §3.8 — 1 = legacy mulberry32 + JS Math.* (ε = 0.0005 acceptance);
  // 2 = PCG64/32 + WASM musl transcendentals (bit-exact). The Replay player
  // branches on this to decide whether to require the WASM determinism module.
  replay_version?: number
}

export interface SessionEndPayload {
  kills: number
  waves_survived: number
  // Raw inputs the backend uses to recompute the canonical score. The client
  // intentionally does NOT send a precomputed `score` / `total_score` — the
  // server is the sole authority on scoring, otherwise a Burp-replay attack
  // (or a backend-recompute bug) would let the client value win.
  kill_value?: number
  cost_total?: number
  time_total?: number
  health_origin?: number
  health_final?: number
  time_exclude_prepare?: number[]
  n_prep_phases?: number
}

export const sessionService = {
  create(
    starRating: number,
    pathConfig?: object,
    initialAnswer?: boolean,
    practiceMode?: boolean,
    challengeId?: string | null,
    seed?: number | null,
    replayVersion?: number,
  ) {
    return api.post<SessionOut>('/api/sessions', {
      star_rating: starRating,
      path_config: pathConfig,
      initial_answer: initialAnswer ?? false,
      practice_mode: practiceMode ?? false,
      challenge_id: challengeId ?? null,
      // Backlog §24 — per-session RNG seed (32-bit unsigned). Optional so a
      // session created by a non-replay-aware caller (legacy tests) still works.
      rng_seed: typeof seed === 'number' ? seed >>> 0 : null,
      // construction plan §3.8 — replay protocol version (default 1; clients that
      // confirmed the WASM determinism module loaded pass 2 to mark the
      // session as bit-exactly replayable).
      replay_version: replayVersion ?? 1,
    })
  },
  getActive() {
    return api.get<SessionOut | null>('/api/sessions/active')
  },
  update(id: string, data: Partial<{ current_wave: number; gold: number; hp: number; score: number; kill_value: number; cost_total: number }>) {
    return api.patch<SessionOut>(`/api/sessions/${id}`, data)
  },
  end(id: string, data: SessionEndPayload) {
    return api.post<SessionOut>(`/api/sessions/${id}/end`, data)
  },
  abandon(id: string) {
    return api.post<SessionOut>(`/api/sessions/${id}/abandon`, {})
  },
  submitReflection(sessionId: string, text: string) {
    return api.post<SessionOut>(`/api/sessions/${sessionId}/reflection`, { text })
  },
  // Backlog §24 — Replay/Spectate event-log ingest. The recorder calls this
  // every couple of seconds; the player calls getReplay once at view mount.
  appendReplayEvents(
    sessionId: string,
    events: ReplayEventIn[],
  ) {
    return api.post<{ written: number }>(
      `/api/sessions/${sessionId}/events`,
      { events },
    )
  },
  getReplay(sessionId: string) {
    return api.get<ReplayBundleOut>(`/api/sessions/${sessionId}/replay`)
  },
}

export interface ReplayEventIn {
  seq: number
  ts: number
  event_type: string
  payload?: unknown
}

export interface ReplayEventOut {
  seq: number
  ts: number
  event_type: string
  payload?: unknown
}

export interface ReplayBundleOut {
  session_id: string
  rng_seed: number | null
  // construction plan §3.8 — 1 = legacy JS path; 2 = bit-exact WASM path. Defaults
  // to 1 when the server returns null/missing for a legacy session.
  replay_version?: number
  star_rating: number
  events: ReplayEventOut[]
}
