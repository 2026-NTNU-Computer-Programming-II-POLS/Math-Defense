/**
 * Shared utilities for the study probe + affect survey views.
 */
import type { ProbeForm } from '@/domain/study/probe-items'

export const PROBE_FORMS_DEFAULT: ProbeForm = 'pre'

export function isProbeForm(v: unknown): v is ProbeForm {
  return v === 'pre' || v === 'post' || v === 'delay'
}

export function isAffectPhase(v: unknown): v is 'pre' | 'post' {
  return v === 'pre' || v === 'post'
}
