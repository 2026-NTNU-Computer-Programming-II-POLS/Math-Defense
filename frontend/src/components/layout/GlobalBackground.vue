<script setup lang="ts">
type Layer = 'far' | 'mid' | 'near'
type Accent = 'warm' | 'cool'

interface Glyph {
  text: string
  layer: Layer
  left: string
  top: string
  size: string
  duration: string
  delay: string
  drift: string
  rotate: string
  accent?: Accent
}

const mathGlyphs: Glyph[] = [
  // Far layer — small, blurred, slow. The "atmospheric perspective" backdrop.
  { text: '∑', layer: 'far', left: '4%',  top: '78%', size: '20px', duration: '42s', delay: '-4s',  drift: '12px',  rotate: '-6deg' },
  { text: 'π', layer: 'far', left: '11%', top: '32%', size: '18px', duration: '38s', delay: '-22s', drift: '-14px', rotate: '8deg'  },
  { text: '≈', layer: 'far', left: '23%', top: '88%', size: '16px', duration: '46s', delay: '-9s',  drift: '10px',  rotate: '14deg' },
  { text: '∂', layer: 'far', left: '32%', top: '14%', size: '20px', duration: '40s', delay: '-30s', drift: '-12px', rotate: '-10deg'},
  { text: 'dy/dx', layer: 'far', left: '44%', top: '60%', size: '18px', duration: '44s', delay: '-12s', drift: '14px',  rotate: '6deg'  },
  { text: '∇', layer: 'far', left: '55%', top: '20%', size: '22px', duration: '36s', delay: '-18s', drift: '-10px', rotate: '12deg' },
  { text: 'ε', layer: 'far', left: '66%', top: '85%', size: '18px', duration: '42s', delay: '-26s', drift: '12px',  rotate: '-8deg' },
  { text: 'Δ', layer: 'far', left: '78%', top: '40%', size: '20px', duration: '40s', delay: '-7s',  drift: '-14px', rotate: '10deg' },
  { text: '∫', layer: 'far', left: '88%', top: '72%', size: '22px', duration: '48s', delay: '-15s', drift: '10px',  rotate: '-12deg'},
  { text: 'φ', layer: 'far', left: '95%', top: '22%', size: '18px', duration: '38s', delay: '-3s',  drift: '-12px', rotate: '14deg' },

  // Mid layer — default visibility. The "main read".
  { text: 'f(x)',   layer: 'mid', left: '8%',  top: '52%', size: '26px', duration: '26s', delay: '-11s', drift: '20px',  rotate: '-10deg' },
  { text: 'a²+b²',  layer: 'mid', left: '18%', top: '20%', size: '24px', duration: '28s', delay: '-19s', drift: '-22px', rotate: '8deg' },
  { text: '3.14',   layer: 'mid', left: '28%', top: '68%', size: '28px', duration: '24s', delay: '-6s',  drift: '18px',  rotate: '14deg' },
  { text: '∀x∈ℝ',  layer: 'mid', left: '42%', top: '34%', size: '24px', duration: '30s', delay: '-23s', drift: '-20px', rotate: '-12deg', accent: 'cool' },
  { text: 'lim',    layer: 'mid', left: '52%', top: '78%', size: '26px', duration: '26s', delay: '-14s', drift: '22px',  rotate: '10deg' },
  { text: '√2',     layer: 'mid', left: '64%', top: '54%', size: '28px', duration: '22s', delay: '-9s',  drift: '-18px', rotate: '-16deg' },
  { text: 'θ',      layer: 'mid', left: '74%', top: '14%', size: '26px', duration: '28s', delay: '-17s', drift: '20px',  rotate: '12deg', accent: 'warm' },
  { text: 'iℏ∂Ψ',  layer: 'mid', left: '84%', top: '60%', size: '24px', duration: '24s', delay: '-21s', drift: '-22px', rotate: '-8deg' },

  // Near layer — large, sharp, soft glow, fast. The "hero motion" elements.
  { text: 'e^{iπ}+1=0',  layer: 'near', left: '15%', top: '76%', size: '40px', duration: '18s', delay: '-8s',  drift: '28px',  rotate: '-6deg', accent: 'warm' },
  { text: '∇·E = ρ/ε₀',  layer: 'near', left: '60%', top: '28%', size: '40px', duration: '16s', delay: '-12s', drift: '-26px', rotate: '8deg',  accent: 'cool' },
  { text: '∑',           layer: 'near', left: '38%', top: '46%', size: '52px', duration: '14s', delay: '-3s',  drift: '24px',  rotate: '-10deg' },
  { text: '∞',           layer: 'near', left: '82%', top: '88%', size: '46px', duration: '18s', delay: '-16s', drift: '-22px', rotate: '6deg' },
  { text: 'dy/dx',       layer: 'near', left: '6%',  top: '12%', size: '38px', duration: '16s', delay: '-5s',  drift: '26px',  rotate: '12deg' },
]

// Constellation: fixed-position dots with dashed connecting lines that slowly
// fade in and out. Coordinates are in a 100×100 SVG viewBox stretched across
// the viewport with preserveAspectRatio=none; the strokes use
// vector-effect=non-scaling-stroke so they stay 1 screen-px regardless of
// stretch, and the dots are positioned with CSS % so they stay circular.
interface Star { x: number; y: number }
interface Edge { from: number; to: number; delay: number }

const stars: Star[] = [
  { x: 15, y: 25 }, // 0 — left cluster
  { x: 28, y: 40 }, // 1
  { x: 22, y: 58 }, // 2
  { x: 70, y: 18 }, // 3 — right triangle
  { x: 82, y: 32 }, // 4
  { x: 75, y: 50 }, // 5
  { x: 50, y: 82 }, // 6 — bottom pair
  { x: 38, y: 88 }, // 7
]

const edges: Edge[] = [
  { from: 0, to: 1, delay: 0 },
  { from: 1, to: 2, delay: 1.4 },
  { from: 3, to: 4, delay: 2.8 },
  { from: 4, to: 5, delay: 4.2 },
  { from: 3, to: 5, delay: 5.6 },
  { from: 6, to: 7, delay: 7.0 },
]
</script>

<template>
  <div class="global-bg" aria-hidden="true">
    <!-- Giant anchor: claims math identity even when no motion -->
    <span class="anchor-glyph">∞</span>

    <!-- Constellation lines (SVG stretches to viewport, strokes stay 1px) -->
    <svg class="constellation-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
      <line
        v-for="(e, i) in edges"
        :key="`line-${i}`"
        :x1="stars[e.from].x"
        :y1="stars[e.from].y"
        :x2="stars[e.to].x"
        :y2="stars[e.to].y"
        :style="{ '--line-delay': `${e.delay}s` }"
      />
    </svg>

    <!-- Constellation dots (positioned in % so they stay circular) -->
    <span
      v-for="(s, i) in stars"
      :key="`star-${i}`"
      class="constellation-dot"
      :style="{
        left: `${s.x}%`,
        top: `${s.y}%`,
        '--dot-delay': `${i * 0.9}s`,
      }"
    />

    <!-- Floating math glyphs across 3 depth layers -->
    <div class="math-field">
      <span
        v-for="(glyph, index) in mathGlyphs"
        :key="`${glyph.text}-${index}`"
        :class="[
          'math-glyph',
          `math-glyph--${glyph.layer}`,
          glyph.accent ? `math-glyph--${glyph.accent}` : null,
        ]"
        :style="{
          '--glyph-left': glyph.left,
          '--glyph-top': glyph.top,
          '--glyph-size': glyph.size,
          '--glyph-duration': glyph.duration,
          '--glyph-delay': glyph.delay,
          '--glyph-drift': glyph.drift,
          '--glyph-rotate': glyph.rotate,
        }"
      >{{ glyph.text }}</span>
    </div>
  </div>
</template>

<style scoped>
.global-bg {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
  background:
    radial-gradient(ellipse 70% 50% at 50% 35%, rgba(248, 252, 255, 0.55) 0%, transparent 70%),
    linear-gradient(165deg, #B8C8D5 0%, #CDD9E2 50%, #ACBDCC 100%);
}

/* ── Anchor glyph ──
   A single giant low-opacity symbol pinned to a corner. Establishes the
   "this is a math product" identity even before any motion registers. */
.anchor-glyph {
  position: absolute;
  right: -3%;
  bottom: -6%;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 38vmin;
  color: rgba(58, 76, 96, 0.05);
  line-height: 1;
  user-select: none;
  animation: anchor-breathe 28s ease-in-out infinite;
  transform-origin: 60% 60%;
}

@keyframes anchor-breathe {
  0%, 100% { opacity: 1;   transform: rotate(0deg); }
  50%      { opacity: 0.65; transform: rotate(3deg); }
}

/* ── Constellation ── */
.constellation-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.constellation-svg line {
  stroke: rgba(58, 76, 96, 0.28);
  stroke-width: 1;
  stroke-linecap: round;
  stroke-dasharray: 3 6;
  vector-effect: non-scaling-stroke;
  opacity: 0;
  animation: constellation-pulse 16s ease-in-out infinite;
  animation-delay: var(--line-delay, 0s);
}

.constellation-dot {
  position: absolute;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: rgba(58, 76, 96, 0.45);
  box-shadow: 0 0 8px rgba(120, 150, 175, 0.45);
  transform: translate(-50%, -50%);
  opacity: 0;
  animation: constellation-pulse 12s ease-in-out infinite;
  animation-delay: var(--dot-delay, 0s);
}

@keyframes constellation-pulse {
  0%, 100% { opacity: 0; }
  35%, 65% { opacity: 1; }
}

/* ── Floating glyph base ── */
.math-glyph {
  position: absolute;
  left: var(--glyph-left);
  top: var(--glyph-top);
  color: rgba(58, 76, 96, 0.16);
  font-family: var(--font-mono);
  font-size: var(--glyph-size);
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  transform: translate3d(-50%, 0, 0) rotate(var(--glyph-rotate));
  animation: glyph-float var(--glyph-duration) linear infinite;
  animation-delay: var(--glyph-delay);
  will-change: transform, opacity;
}

/* Far: small, hazy, low alpha — the depth backdrop. blur is GPU-cheap at
   1.2px on ≤10 elements, but flips the layer to software compositing in
   some browsers, so keep the count and radius modest. */
.math-glyph--far {
  filter: blur(1.2px);
  color: rgba(58, 76, 96, 0.10);
}

/* Mid: inherits base values (the original look) */

/* Near: large, sharp, soft glow */
.math-glyph--near {
  color: rgba(40, 58, 78, 0.24);
  text-shadow: 0 0 14px rgba(120, 150, 175, 0.20);
  letter-spacing: 0.5px;
}

/* Accent tints — applied sparingly to break the monochrome */
.math-glyph--warm {
  color: rgba(168, 113, 78, 0.20);
}
.math-glyph--warm.math-glyph--near {
  color: rgba(168, 113, 78, 0.28);
  text-shadow: 0 0 14px rgba(214, 152, 102, 0.22);
}

.math-glyph--cool {
  color: rgba(72, 130, 158, 0.22);
}
.math-glyph--cool.math-glyph--near {
  color: rgba(60, 120, 150, 0.30);
  text-shadow: 0 0 14px rgba(110, 175, 200, 0.25);
}

@keyframes glyph-float {
  0% {
    opacity: 0;
    transform: translate3d(-50%, 38px, 0) rotate(var(--glyph-rotate));
  }
  12% {
    opacity: 1;
  }
  76% {
    opacity: 0.82;
  }
  100% {
    opacity: 0;
    transform: translate3d(calc(-50% + var(--glyph-drift)), -118vh, 0) rotate(calc(var(--glyph-rotate) + 34deg));
  }
}

@media (prefers-reduced-motion: reduce) {
  .math-glyph,
  .constellation-dot,
  .constellation-svg line,
  .anchor-glyph {
    animation: none;
  }
  .math-glyph         { opacity: 0.42; }
  .math-glyph--far    { opacity: 0.28; }
  .math-glyph--near   { opacity: 0.55; }
  .constellation-dot  { opacity: 0.6; }
  .constellation-svg line { opacity: 0.5; }
}
</style>
