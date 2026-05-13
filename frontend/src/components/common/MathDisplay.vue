<script setup lang="ts">
import { ref, watchEffect, onMounted } from 'vue'
import katex from 'katex'

const props = defineProps<{
  latex: string
  displayMode?: boolean
}>()

const container = ref<HTMLSpanElement | null>(null)

function render() {
  if (!container.value) return
  try {
    katex.render(props.latex, container.value, {
      displayMode: props.displayMode ?? false,
      throwOnError: false,
    })
  } catch {
    container.value.textContent = props.latex
  }
}

onMounted(render)
watchEffect(render)
</script>

<template>
  <span ref="container" class="math-display" />
</template>

<style>
@import 'katex/dist/katex.min.css';
</style>
