import type { SlotInfo } from '@/services/territoryService'

export type ChallengeMode = 'seize' | 'improve' | 'challenge'

export function getChallengeMode(slot: SlotInfo, userId: string | null | undefined): ChallengeMode {
  if (!slot.occupation) return 'seize'
  if (userId && slot.occupation.student_id === userId) return 'improve'
  if (slot.occupation.is_own) return 'improve'
  return 'challenge'
}

export const CHALLENGE_MODE_LABEL: Record<ChallengeMode, string> = {
  seize: 'Seize',
  improve: 'Improve',
  challenge: 'Challenge',
}

export const CHALLENGE_MODE_TITLE: Record<ChallengeMode, string> = {
  seize: 'Seize this slot',
  improve: 'Improve your score',
  challenge: 'Challenge the holder',
}
