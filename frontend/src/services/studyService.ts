/**
 * studyService.ts — Empirical Validity Probe (Pedagogical_Backlog_Spec.md §27).
 */
import { api } from '@/services/api'

export {
  PROBE_ITEMS,
  PROBE_FORM_LABEL,
  AFFECT_ITEMS,
  LIKERT_ANCHORS,
} from '@/domain/study/probe-items'
export type {
  ProbeForm,
  ProbeItem,
  ProbeOption,
  LikertItem,
} from '@/domain/study/probe-items'

export interface EnrollResponse { group: 'A' | 'B' }
export interface ProbeSubmitResponse { score: number; total: number }

export interface ProbeResponseItemDTO { item_id: string; selected: string }

export const studyService = {
  enroll(studyId: string) {
    return api.post<EnrollResponse>(
      `/api/study/enroll?study_id=${encodeURIComponent(studyId)}`,
      {},
    )
  },
  submitProbe(studyId: string, form: 'pre' | 'post' | 'delay', responses: ProbeResponseItemDTO[]) {
    return api.post<ProbeSubmitResponse>('/api/study/probe', {
      study_id: studyId,
      form,
      responses,
    })
  },
  submitAffect(
    studyId: string,
    phase: 'pre' | 'post',
    anxietyItems: number[],
    motivationItems: number[],
  ) {
    return api.post<void>('/api/study/affect', {
      study_id: studyId,
      phase,
      anxiety_items: anxietyItems,
      motivation_items: motivationItems,
    })
  },
}
