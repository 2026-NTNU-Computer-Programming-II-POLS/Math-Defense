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
  max-width: 720px;
  margin: 0 auto;
  padding: 2.5rem 1.5rem 3rem;
  color: var(--text-primary);
  min-height: 100vh;
  background: var(--bg-base);
  line-height: 1.6;
}

.about-header {
  margin-bottom: 2rem;
}

h1 {
  font-size: 1.8rem;
  color: var(--gold);
  text-shadow: var(--gold-shadow);
  margin-bottom: 0.5rem;
  letter-spacing: 2px;
}

.about-lead {
  color: var(--axis);
  text-shadow: var(--gold-shadow);
  font-size: 1rem;
}

.about-section {
  margin-bottom: 1.75rem;
}

.about-section h2 {
  font-size: 1.1rem;
  color: var(--gold);
  text-shadow: var(--gold-shadow);
  margin-bottom: 0.6rem;
  letter-spacing: 1px;
}

.about-section ul {
  padding-left: 1.2rem;
}

.about-section li {
  margin-bottom: 0.5rem;
}

.about-section a {
  color: var(--gold-bright);
  text-decoration: underline;
}

.about-section a:hover,
.about-section a:focus-visible {
  filter: brightness(1.2);
}

kbd {
  display: inline-block;
  padding: 1px 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.85em;
  background: var(--stone-selected);
  border: 1px solid var(--panel-border);
  border-radius: 3px;
}

code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.9em;
  color: var(--axis);
  text-shadow: var(--gold-shadow);
}

.back-btn {
  padding: 0.5rem 1.5rem;
  background: transparent;
  color: var(--axis);
  text-shadow: var(--gold-shadow);
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  cursor: pointer;
}

.back-btn:hover,
.back-btn:focus-visible {
  border-color: var(--gold-bright);
  color: var(--gold-bright);
}
</style>
