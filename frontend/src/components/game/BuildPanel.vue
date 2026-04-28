<script setup lang="ts">
import { computed } from 'vue'
import { useUiStore } from '@/stores/uiStore'
import { useGameStore } from '@/stores/gameStore'
import TowerInfoPanel from './TowerInfoPanel.vue'

const uiStore = useUiStore()
const gameStore = useGameStore()

const hasTower = computed(() => !!uiStore.buildPanelTowerId)
</script>

<template>
  <TowerInfoPanel v-if="hasTower" />
</template>
