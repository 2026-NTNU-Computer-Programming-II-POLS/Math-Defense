<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { STAR_MIN, STAR_MAX } from '@/data/difficulty-defs'
import { generateLevel } from '@/domain/level/level-generator'
import { mulberry32 } from '@/math/MathUtils'
import type { GeneratedLevel } from '@/math/curve-types'

const router = useRouter()
const selectedStar = ref(1)
const generating = ref(false)
const error = ref<string | null>(null)

const stars = Array.from({ length: STAR_MAX - STAR_MIN + 1 }, (_, i) => STAR_MIN + i)

const starLabels: Record<number, string> = {
  1: 'Beginner Training',
  2: 'Intermediate',
  3: 'Advanced',
  4: 'Expert',
  5: 'Legendary',
}

function selectStar(star: number) {
  selectedStar.value = star
  error.value = null
}

function startLevel() {
  generating.value = true
  error.value = null
  try {
    const seed = Date.now()
    const rng = mulberry32(seed)
    const level = generateLevel(selectedStar.value, rng)
    router.push({
      name: 'initial-answer',
      state: { level: JSON.stringify(level), seed },
    })
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    generating.value = false
  }
}
</script>

<template>
  <div class="level-select">
    <h1>Select Difficulty</h1>
    <div class="star-grid">
      <button
        v-for="star in stars"
        :key="star"
        class="star-card"
        :class="{ selected: selectedStar === star }"
        @click="selectStar(star)"
      >
        <div class="star-icons">
          <span v-for="s in star" :key="s" class="star-icon">&#9733;</span>
        </div>
        <div class="star-label">{{ starLabels[star] }}</div>
      </button>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <button class="start-btn" :disabled="generating" @click="startLevel">
      {{ generating ? 'Generating...' : 'Generate Level' }}
    </button>
    <button class="back-btn" @click="router.push({ name: 'menu' })">Back</button>
  </div>
</template>

<style scoped>
.level-select {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem;
  color: #e0d0b0;
  min-height: 100vh;
  background: #1a1520;
}

h1 {
  font-size: 2rem;
  margin-bottom: 2rem;
  color: #ffd700;
}

.star-grid {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: center;
  max-width: 800px;
  margin-bottom: 2rem;
}

.star-card {
  background: #252030;
  border: 2px solid #3a3028;
  border-radius: 8px;
  padding: 1.5rem 1rem;
  cursor: pointer;
  min-width: 140px;
  text-align: center;
  transition: all 0.2s;
  color: #e0d0b0;
}

.star-card:hover {
  border-color: #8b7342;
}

.star-card.selected {
  border-color: #ffd700;
  background: #2a2535;
  box-shadow: 0 0 12px rgba(255, 215, 0, 0.3);
}

.star-icons {
  font-size: 1.5rem;
  color: #ffd700;
  margin-bottom: 0.5rem;
}

.star-label {
  font-size: 0.9rem;
}

.start-btn {
  padding: 0.8rem 2rem;
  font-size: 1.1rem;
  background: #4a82c8;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 1rem;
}

.start-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.start-btn:hover:not(:disabled) {
  background: #5a92d8;
}

.back-btn {
  padding: 0.5rem 1.5rem;
  background: transparent;
  color: #8b7342;
  border: 1px solid #3a3028;
  border-radius: 6px;
  cursor: pointer;
}

.error {
  color: #cc4444;
  margin-bottom: 1rem;
}
</style>
