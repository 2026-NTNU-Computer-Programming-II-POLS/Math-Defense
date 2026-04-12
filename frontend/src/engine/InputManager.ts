/**
 * InputManager — mouse and keyboard input management (TypeScript)
 */
import { Events } from '@/data/constants'
import { canvasToGame } from '@/math/MathUtils'
import type { GameEventBus } from './Game'

export class InputManager {
  private canvas: HTMLCanvasElement
  private bus: GameEventBus
  private _keysDown = new Set<string>()
  // Guards against double-destroy during HMR or repeated onUnmounted invocations.
  private _destroyed = false

  // Retain listener references for removal during destroy
  private _onClick: (e: MouseEvent) => void
  private _onMove: (e: MouseEvent) => void
  private _onKeyDown: (e: KeyboardEvent) => void
  private _onKeyUp: (e: KeyboardEvent) => void

  mousePixel = { x: 0, y: 0 }
  mouseGame = { x: 0, y: 0 }

  constructor(canvas: HTMLCanvasElement, bus: GameEventBus) {
    this.canvas = canvas
    this.bus = bus

    this._onClick = (e) => {
      this._updateMouse(e)
      this.bus.emit(Events.CANVAS_CLICK, {
        pixel: { ...this.mousePixel },
        game: { ...this.mouseGame },
      })
    }
    this._onMove = (e) => {
      this._updateMouse(e)
      this.bus.emit(Events.CANVAS_HOVER, {
        pixel: { ...this.mousePixel },
        game: { ...this.mouseGame },
      })
    }
    this._onKeyDown = (e) => this._keysDown.add(e.code)
    this._onKeyUp = (e) => this._keysDown.delete(e.code)

    canvas.addEventListener('click', this._onClick)
    canvas.addEventListener('mousemove', this._onMove)
    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)
  }

  private _updateMouse(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect()
    const scaleX = this.canvas.width / rect.width
    const scaleY = this.canvas.height / rect.height
    this.mousePixel.x = (e.clientX - rect.left) * scaleX
    this.mousePixel.y = (e.clientY - rect.top) * scaleY
    const gp = canvasToGame(this.mousePixel.x, this.mousePixel.y)
    this.mouseGame.x = gp.x
    this.mouseGame.y = gp.y
  }

  isKeyDown(code: string): boolean {
    return this._keysDown.has(code)
  }

  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    this.canvas.removeEventListener('click', this._onClick)
    this.canvas.removeEventListener('mousemove', this._onMove)
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup', this._onKeyUp)
    this._keysDown.clear()
  }
}
