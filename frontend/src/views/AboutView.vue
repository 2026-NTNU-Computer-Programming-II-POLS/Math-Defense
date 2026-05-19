<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="about-view">
    <header class="about-header">
      <h1>Accessibility Statement</h1>
      <p class="about-lead">
        We aim for WCAG 2.2 AA but acknowledge gaps.
      </p>
    </header>

    <section class="about-section">
      <h2>Known limits</h2>
      <ul>
        <li>
          The gameplay area is rendered on a HTML <code>&lt;canvas&gt;</code>
          element, which screen readers cannot inspect directly.
        </li>
        <li>
          Animations and particle effects do not yet honour
          <code>prefers-reduced-motion</code>.
        </li>
      </ul>
    </section>

    <section class="about-section">
      <h2>Supported assistive workflows</h2>
      <ul>
        <li>
          <strong>Keyboard navigation.</strong> Arrow keys move a cursor over
          legal grid points, <kbd>Enter</kbd> places a held tower,
          <kbd>1</kbd>&ndash;<kbd>7</kbd> picks a tower type,
          <kbd>Tab</kbd> cycles tower types, <kbd>Esc</kbd> cancels. The game
          is completable at Star-1 without a mouse.
        </li>
        <li>
          <strong>Colour-blind support.</strong> Each tower carries a unique
          glyph (e.g. <span aria-hidden="true">∫ ∞ ⊞ ✦</span>) so types remain
          distinguishable in greyscale and for users who cannot rely on hue.
        </li>
        <li>
          <strong>Practice mode.</strong> An opt-in setting (Profile &rarr;
          Game Settings) re-enables sliders for Magic and Matrix coefficient input.
          Practice-mode runs do not appear on the global leaderboard but still
          unlock achievements and award talent points.
        </li>
      </ul>
    </section>

    <section class="about-section">
      <h2>Reporting blockers</h2>
      <p>
        If you hit an accessibility blocker, please email
        <a href="mailto:leolove3very@gmail.com?subject=Math%20Defense%20accessibility%20report">
          leolove3very@gmail.com
        </a>
        with steps to reproduce and the assistive technology you were using.
      </p>
    </section>

    <button class="back-btn" @click="router.push({ name: 'menu' })">Back</button>
  </div>
</template>

<style scoped>
.about-view {
  max-width: 760px;
  margin: 40px auto;
  padding: 26px;
  color: var(--charcoal);
  background: rgba(220, 229, 237, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.85);
  border-radius: 16px;
  box-shadow: var(--shadow);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  line-height: 1.6;
}

.about-header {
  margin-bottom: 2rem;
}

h1 {
  font-size: 1.6rem;
  font-family: var(--font-mono);
  color: var(--charcoal);
  margin-bottom: 0.5rem;
  letter-spacing: 2px;
  font-weight: 800;
}

.about-lead {
  color: var(--charcoal-soft);
  font-size: var(--text-base);
}

.about-section {
  margin-bottom: 1.75rem;
}

.about-section h2 {
  font-size: 0.68rem;
  font-family: var(--font-mono);
  color: var(--charcoal-soft);
  text-transform: uppercase;
  margin-bottom: 0.6rem;
  letter-spacing: 4px;
}

.about-section ul {
  padding-left: 1.2rem;
}

.about-section li {
  margin-bottom: 0.5rem;
}

.about-section a {
  color: var(--terracotta-deep);
  text-decoration: underline;
}

.about-section a:hover,
.about-section a:focus-visible {
  filter: brightness(1.1);
}

kbd {
  display: inline-block;
  padding: 2px 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.85em;
  color: var(--terracotta-deep);
  background: rgba(168, 188, 203, 0.24);
  border: 1px solid var(--line);
  border-radius: 6px;
}

code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.9em;
  color: var(--terracotta-deep);
}

.back-btn {
  padding: 0.5rem 1.5rem;
  background: transparent;
  color: var(--charcoal-soft);
  border: 1px solid var(--line);
  border-radius: 10px;
  cursor: pointer;
}

.back-btn:hover,
.back-btn:focus-visible {
  border-color: var(--terracotta);
  color: var(--charcoal);
  background: rgba(245, 250, 254, 0.6);
}
</style>
