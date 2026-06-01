/**
 * Sprite exporter for documentation (NOT part of the game build).
 *
 * Neither enemies nor towers have image assets — they are drawn procedurally by
 * `EnemyRenderer` / `TowerRenderer` onto a Canvas 2D context. This tool reuses
 * those exact renderers (no game logic is touched) to paint each enemy and each
 * tower onto its own transparent canvas, then lets you save every frame as a PNG
 * into a folder of your choice (split into `monsters/` and `towers/`).
 *
 * Output style:
 *   - transparent background
 *   - clean body + identity cues (monster auras / tower instrument + glyph)
 *   - towers shown at base level, idle, not firing, not configured-glow
 *   - no HP / shield bars, no upgrade rings
 *
 * Run via the Vite dev server, then open:  /tools/sprite-export.html
 * Lives outside `src/` so it stays clear of arch-check / vue-tsc / eslint.
 */
import { EnemyRenderer } from '@/renderers/EnemyRenderer'
import { TowerRenderer } from '@/renderers/TowerRenderer'
import { Renderer } from '@/engine/Renderer'
import { ENEMY_DEFS } from '@/data/enemy-defs'
import { TOWER_DEFS } from '@/data/tower-defs'
import { ORIGIN_X, ORIGIN_Y, UNIT_PX } from '@/data/constants'
import type {
  EnemyView,
  EnemyAppearance,
  TowerView,
  TowerAppearance,
  TowerSceneView,
} from '@/engine/projections/views'

// ── Shared helpers ───────────────────────────────────────────────────────────

const SUPERSAMPLE = 4 // render at N× then downscale on display for crisp PNGs
const MAX_DIM = 1100 // cap the backing buffer (mostly for the wide Helper aura)

interface Rendered {
  readonly id: string
  readonly name: string
  readonly detail: string
  readonly canvas: HTMLCanvasElement
}

/** Build a square transparent canvas centred on game-(0,0) at `scale`. */
function makeCanvas(half: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  let scale = SUPERSAMPLE
  if (2 * half * scale > MAX_DIM) scale = MAX_DIM / (2 * half)
  scale = Math.max(1.5, scale)
  const dim = Math.ceil(2 * half * scale)
  const canvas = document.createElement('canvas')
  canvas.width = dim
  canvas.height = dim
  const ctx = canvas.getContext('2d')!
  // The renderers map an entity at game-(0,0) to canvas-(ORIGIN_X, ORIGIN_Y).
  // This transform re-centres that point on our small canvas and applies the
  // supersample scale, so the renderers' own pixel maths is untouched.
  ctx.setTransform(scale, 0, 0, scale, dim / 2 - scale * ORIGIN_X, dim / 2 - scale * ORIGIN_Y)
  return { canvas, ctx }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolveBlob, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolveBlob(blob)
      else reject(new Error('canvas.toBlob returned null'))
    }, 'image/png')
  })
}

// ── Monsters ─────────────────────────────────────────────────────────────────

// How far each enemy type's art extends from the body centre, as a multiple of
// its `size`. Tuned to the per-type recipes in EnemyRenderer so the transparent
// canvas crops tightly without clipping satellites / ghosts / rings.
const ENEMY_REACH_MULT: Record<EnemyAppearance, number> = {
  general: 0.85,
  fast: 1.25, // trailing motion-blur ghosts
  strong: 0.95,
  split: 0.9,
  helper: 0.9, // body only; the wide support aura is handled below
  regenerator: 1.5, // rotating ring + rising "+ε" particles
  bulwark: 0.75,
  swarmling: 1.0, // three orbiting ε satellites + jitter
  bossA: 1.05,
  bossB: 1.0,
}

function renderMonster(): Rendered[] {
  return Object.values(ENEMY_DEFS).map((def) => {
    const id = def.type as EnemyAppearance
    const size = def.size
    const helperRadius = def.helper?.radius ?? 0

    let reach = size * (ENEMY_REACH_MULT[id] ?? 1)
    if (helperRadius > 0) reach = Math.max(reach, helperRadius * UNIT_PX)
    const half = reach + Math.max(12, size * 0.4)

    const { canvas, ctx } = makeCanvas(half)
    const view: EnemyView = {
      x: 0,
      y: 0,
      type: id,
      size,
      color: def.color,
      frostRatio: 0,
      hpRatio: null, // null ⇒ renderer skips the HP bar
      shieldRatio: null, // null ⇒ renderer skips the shield bar
      helperRadius,
      regenerating: id === 'regenerator',
      dyingProgress: 0,
      hitFlashAge: 0,
    }

    // `_drawEnemy` is private; reach it through a cast. Only the canvas is read,
    // no game logic runs. The fake renderer only needs `ctx`; `drawHealthBar`
    // is never called because hpRatio/shieldRatio are null.
    const enemyRenderer = new EnemyRenderer()
    ;(enemyRenderer as unknown as {
      _drawEnemy(r: { ctx: CanvasRenderingContext2D }, v: EnemyView): void
    })._drawEnemy({ ctx }, view)

    return { id, name: def.name, detail: `${id} · ${size}px`, canvas }
  })
}

// ── Towers ───────────────────────────────────────────────────────────────────

const TOWER_HALF = 30 // towers share a uniform silhouette box (~22px instrument)

// One real Renderer instance lent only for its palette (the exact board theme
// the live game uses). The throwaway canvas is never drawn to.
const PALETTE = new Renderer(document.createElement('canvas')).palette

function renderTower(): Rendered[] {
  return Object.values(TOWER_DEFS).map((def) => {
    const id = def.type as TowerAppearance
    const { canvas, ctx } = makeCanvas(TOWER_HALF)

    const view: TowerView = {
      x: 0,
      y: 0,
      type: id,
      color: def.color,
      configured: false, // omit the white "configured" status ring
      disabled: false,
      glyph: def.glyph,
      firingFlashAge: 999, // >= ANIM.TOWER_FIRE_FLASH ⇒ no muzzle flash / fire bloom
      level: 1, // base tier: no gold rim / rotating rune ring
      idleSeed: 0,
      arcStart: 0,
      arcEnd: Math.PI / 2, // default arc ⇒ sextant / telescope point upper-right
      aimAngle: null, // no tracked target ⇒ idle rest pose
      matrixCells: id === 'matrix' ? [1, 2, 3, 4] : null,
      chargeProgress: null, // idle ⇒ no Limit charge ring
    }
    const sceneView = { showCoords: false } as unknown as TowerSceneView

    // `_drawTower` is private and reads instance fields `_palette` / `_time`;
    // set them, then invoke through a cast. No game logic runs.
    const towerRenderer = new TowerRenderer()
    ;(towerRenderer as unknown as { _palette: typeof PALETTE })._palette = PALETTE
    ;(towerRenderer as unknown as { _time: number })._time = 0
    ;(towerRenderer as unknown as {
      _drawTower(r: { ctx: CanvasRenderingContext2D }, v: TowerSceneView, t: TowerView): void
    })._drawTower({ ctx }, sceneView, view)

    return { id, name: def.nameEn, detail: `${id} · ${def.glyph}`, canvas }
  })
}

// ── Contact sheet ──────────────────────────────────────────────────────────────

function renderContactSheet(title: string, items: ReadonlyArray<Rendered>): HTMLCanvasElement {
  const COLS = 5
  const CELL = 200
  const LABEL_H = 44
  const PAD = 16
  const HEAD = 36
  const SS = 2
  const rows = Math.ceil(items.length / COLS)

  const sheet = document.createElement('canvas')
  sheet.width = (COLS * CELL + PAD * 2) * SS
  sheet.height = (HEAD + rows * (CELL + LABEL_H) + PAD * 2) * SS
  const ctx = sheet.getContext('2d')!
  ctx.scale(SS, SS)

  ctx.fillStyle = '#222222'
  ctx.font = '700 22px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(title, PAD, PAD + 22)

  ctx.textAlign = 'center'
  items.forEach(({ name, detail, canvas }, i) => {
    const cx = PAD + (i % COLS) * CELL + CELL / 2
    const cyTop = HEAD + PAD + Math.floor(i / COLS) * (CELL + LABEL_H)

    const fit = (CELL - 24) / Math.max(canvas.width, canvas.height)
    const w = canvas.width * fit
    const h = canvas.height * fit
    ctx.drawImage(canvas, cx - w / 2, cyTop + (CELL - h) / 2, w, h)

    ctx.fillStyle = '#222222'
    ctx.font = '700 18px system-ui, sans-serif'
    ctx.fillText(name, cx, cyTop + CELL + 18)
    ctx.fillStyle = '#888888'
    ctx.font = '400 13px system-ui, sans-serif'
    ctx.fillText(detail, cx, cyTop + CELL + 36)
  })

  return sheet
}

// ── Page wiring ──────────────────────────────────────────────────────────────

function appendGallery(containerId: string, items: ReadonlyArray<Rendered>): void {
  const gallery = document.getElementById(containerId)!
  for (const { name, detail, canvas } of items) {
    const fig = document.createElement('figure')
    fig.className = 'cell'
    canvas.style.maxWidth = '150px'
    canvas.style.maxHeight = '150px'
    const cap = document.createElement('figcaption')
    cap.innerHTML = `<strong>${name}</strong><span>${detail}</span>`
    fig.append(canvas, cap)
    gallery.append(fig)
  }
}

async function main(): Promise<void> {
  await document.fonts.ready // ensure math glyph fonts are ready before painting

  const monsters = renderMonster()
  const towers = renderTower()
  const monsterSheet = renderContactSheet('Monsters', monsters)
  const towerSheet = renderContactSheet('Towers', towers)

  appendGallery('monsters', monsters)
  appendGallery('towers', towers)

  const status = document.getElementById('status')!
  const setStatus = (msg: string): void => {
    status.textContent = msg
  }

  // Primary path: write every PNG into a folder the user picks, split into
  // `monsters/` and `towers/` subfolders with an overview sheet in each.
  document.getElementById('saveFolder')!.addEventListener('click', async () => {
    const picker = (window as unknown as {
      showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
    }).showDirectoryPicker
    if (!picker) {
      setStatus('此瀏覽器不支援資料夾寫入，請改用「逐一下載」。')
      return
    }
    try {
      const root = await picker()
      type DirHandle = {
        getDirectoryHandle(n: string, o: { create: boolean }): Promise<DirHandle>
        getFileHandle(n: string, o: { create: boolean }): Promise<FileSystemFileHandle>
      }
      const write = async (dir: DirHandle, name: string, canvas: HTMLCanvasElement): Promise<void> => {
        const blob = await canvasToBlob(canvas)
        const handle = await dir.getFileHandle(name, { create: true })
        const writable = await (handle as unknown as {
          createWritable(): Promise<{ write(d: Blob): Promise<void>; close(): Promise<void> }>
        }).createWritable()
        await writable.write(blob)
        await writable.close()
      }
      const rootDir = root as unknown as DirHandle
      const monsterDir = await rootDir.getDirectoryHandle('monsters', { create: true })
      const towerDir = await rootDir.getDirectoryHandle('towers', { create: true })
      for (const m of monsters) await write(monsterDir, `${m.id}.png`, m.canvas)
      await write(monsterDir, '_overview.png', monsterSheet)
      for (const t of towers) await write(towerDir, `${t.id}.png`, t.canvas)
      await write(towerDir, '_overview.png', towerSheet)
      setStatus(`已輸出 ${monsters.length} 隻怪物 + ${towers.length} 座塔（含總覽圖）到 monsters/ 與 towers/ ✓`)
    } catch (err) {
      setStatus(`取消或失敗：${(err as Error).message}`)
    }
  })

  // Fallback: browser downloads (no folders) — prefix the name with the kind.
  document.getElementById('downloadEach')!.addEventListener('click', async () => {
    const download = async (name: string, canvas: HTMLCanvasElement): Promise<void> => {
      const blob = await canvasToBlob(canvas)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
    }
    for (const m of monsters) await download(`monster-${m.id}.png`, m.canvas)
    await download('monsters-overview.png', monsterSheet)
    for (const t of towers) await download(`tower-${t.id}.png`, t.canvas)
    await download('towers-overview.png', towerSheet)
    setStatus(`已觸發 ${monsters.length + towers.length + 2} 個檔案下載（請看瀏覽器的下載資料夾）。`)
  })

  setStatus(`已繪製 ${monsters.length} 隻怪物 + ${towers.length} 座塔，請選擇輸出方式。`)
}

void main()
