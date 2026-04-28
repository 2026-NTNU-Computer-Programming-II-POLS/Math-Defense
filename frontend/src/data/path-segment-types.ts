/**
 * Declarative types for piecewise-function path segments.
 *
 * Type-only module: no closures, no runtime state, safe to serialize.
 * The domain layer (`domain/path/`) turns these data shapes into executable
 * runtime objects; see `PathSegmentRuntime` in `segmented-path.ts`.
 */

/** Closed-form family a segment's math belongs to. */
export type PathSegmentKind =
  | 'horizontal'
  | 'linear'
  | 'quadratic'
  | 'trigonometric'
  | 'vertical'
  | 'curve'

/**
 * Kind-specific parameters. Discriminated on `kind`, so a consumer that
 * switches on `params.kind` is exhaustively checked by the TS compiler.
 */
export type PathSegmentParams =
  | { readonly kind: 'horizontal';    readonly y: number }
  | { readonly kind: 'linear';        readonly slope: number; readonly intercept: number }
  | { readonly kind: 'quadratic';     readonly a: number; readonly b: number; readonly c: number }
  | { readonly kind: 'trigonometric'; readonly amplitude: number; readonly frequency: number; readonly phase: number; readonly offset: number }
  | {
      readonly kind: 'vertical'
      readonly x: number
      readonly yStart: number
      readonly yEnd: number
      readonly durationSec: number
    }
  | { readonly kind: 'curve' }

/**
 * One piecewise segment.
 *
 * `xRange` is inclusive on both ends at the data layer; at runtime the
 * `SegmentedPath.findSegmentAt` lookup resolves boundary values to the
 * right-hand segment (see spec §14.1).
 *
 * Vertical segments collapse to `xRange = [x, x]`; their y progression is
 * driven by `durationSec`, not by `x`, and is handled by the vertical
 * movement strategy at runtime.
 *
 * @remarks `kind` on the outer shape must match `params.kind`. The validator
 * enforces this (see `domain/path/path-validator.ts`).
 */
export interface PathSegmentDef {
  readonly id: string
  readonly xRange: readonly [number, number]
  readonly kind: PathSegmentKind
  readonly params: PathSegmentParams
  readonly label?: string
  readonly expr?: string
}

/** Complete piecewise layout for a single level. */
export interface PathLayout {
  readonly segments: ReadonlyArray<PathSegmentDef>
}
