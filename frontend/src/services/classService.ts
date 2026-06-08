import { api } from './api'

export interface ClassInfo {
  id: string
  name: string
  teacher_id: string
  join_code?: string
  created_at: string
  teacher_player_name?: string
  description?: string | null
  subject?: string | null
  school_year?: string | null
  capacity?: number | null
  color?: string | null
  icon?: string | null
  archived_at?: string | null
}

export interface Membership {
  id: string
  class_id: string
  student_id: string
  joined_at: string
  player_name: string
  email: string
}

export interface ClassReflection {
  session_id: string
  student_id: string
  student_name: string
  star_rating: number
  score: number
  // V3 canonical score; shown as total_score ?? score to match the leaderboard.
  total_score: number | null
  reflection_text: string
  ended_at: string | null
}

export interface CoTeacher {
  id: string
  class_id: string
  teacher_id: string
  player_name: string
  email: string
  added_at: string
}

export interface PendingInvite {
  id: string
  class_id: string
  email: string
  invited_at: string
}

export interface BulkAddResult {
  added: Membership[]
  invited: PendingInvite[]
  skipped: { email: string; reason: string }[]
}

export interface ClassGroup {
  id: string
  class_id: string
  name: string
  color: string | null
  created_at: string
  member_count: number
}

export interface GroupMember {
  group_id: string
  student_id: string
  player_name: string
  email: string
}

export interface ClassLeaderboardEntry {
  student_id: string
  player_name: string
  sessions_played: number
  average_stars: number
  total_score: number
  last_played_at: string | null
}

export interface ClassReportRow {
  student_id: string
  player_name: string
  email: string
  joined_at: string
  sessions_played: number
  average_stars: number
  total_score: number
  last_played_at: string | null
  reflections_count: number
}

export interface JoinQr {
  code: string
  join_url: string
}

export interface CreateClassPayload {
  name: string
  description?: string | null
  subject?: string | null
  school_year?: string | null
  capacity?: number | null
  color?: string | null
  icon?: string | null
}

export type UpdateClassPayload = Partial<CreateClassPayload>

export const classService = {
  createClass(payload: string | CreateClassPayload) {
    const body = typeof payload === 'string' ? { name: payload } : payload
    return api.post<ClassInfo>('/api/classes', body)
  },
  listClasses(includeArchived = true) {
    const qs = includeArchived ? '' : '?include_archived=false'
    return api.get<ClassInfo[]>(`/api/classes${qs}`)
  },
  getClass(id: string) {
    return api.get<ClassInfo>(`/api/classes/${id}`)
  },
  renameClass(classId: string, name: string) {
    return api.put<ClassInfo>(`/api/classes/${classId}`, { name })
  },
  updateClass(classId: string, payload: UpdateClassPayload) {
    return api.put<ClassInfo>(`/api/classes/${classId}`, payload)
  },
  deleteClass(classId: string) {
    return api.delete(`/api/classes/${classId}`)
  },
  archiveClass(classId: string) {
    return api.post<ClassInfo>(`/api/classes/${classId}/archive`, {})
  },
  unarchiveClass(classId: string) {
    return api.post<ClassInfo>(`/api/classes/${classId}/unarchive`, {})
  },
  transferOwnership(classId: string, newTeacherId: string) {
    return api.post<ClassInfo>(`/api/classes/${classId}/transfer`, { new_teacher_id: newTeacherId })
  },

  addStudent(classId: string, email: string) {
    return api.post<Membership>(`/api/classes/${classId}/students`, { email })
  },
  bulkAddStudents(classId: string, emails: string[]) {
    return api.post<BulkAddResult>(`/api/classes/${classId}/students/bulk`, { emails })
  },
  removeStudent(classId: string, studentId: string) {
    return api.delete(`/api/classes/${classId}/students/${studentId}`)
  },
  moveStudent(classId: string, studentId: string, targetClassId: string) {
    return api.post<Membership>(
      `/api/classes/${classId}/students/${studentId}/move`,
      { target_class_id: targetClassId },
    )
  },
  listStudents(classId: string) {
    return api.get<Membership[]>(`/api/classes/${classId}/students`)
  },

  joinByCode(code: string) {
    return api.post<Membership>('/api/classes/join', { code })
  },
  claimInvites() {
    return api.post<Membership[]>('/api/classes/claim-invites', {})
  },
  regenerateCode(classId: string) {
    return api.post<{ join_code: string }>(`/api/classes/${classId}/regenerate-code`, {})
  },
  joinQr(classId: string) {
    return api.get<JoinQr>(`/api/classes/${classId}/qr`)
  },

  listReflections(classId: string) {
    return api.get<ClassReflection[]>(`/api/classes/${classId}/reflections`)
  },

  listCoTeachers(classId: string) {
    return api.get<CoTeacher[]>(`/api/classes/${classId}/co-teachers`)
  },
  addCoTeacher(classId: string, email: string) {
    return api.post<CoTeacher>(`/api/classes/${classId}/co-teachers`, { email })
  },
  removeCoTeacher(classId: string, teacherId: string) {
    return api.delete(`/api/classes/${classId}/co-teachers/${teacherId}`)
  },

  listInvites(classId: string) {
    return api.get<PendingInvite[]>(`/api/classes/${classId}/invites`)
  },
  revokeInvite(classId: string, email: string) {
    return api.delete(`/api/classes/${classId}/invites/${encodeURIComponent(email)}`)
  },

  listGroups(classId: string) {
    return api.get<ClassGroup[]>(`/api/classes/${classId}/groups`)
  },
  createGroup(classId: string, name: string, color?: string | null) {
    return api.post<ClassGroup>(`/api/classes/${classId}/groups`, { name, color: color ?? null })
  },
  updateGroup(classId: string, groupId: string, payload: { name?: string; color?: string | null }) {
    return api.put<ClassGroup>(`/api/classes/${classId}/groups/${groupId}`, payload)
  },
  deleteGroup(classId: string, groupId: string) {
    return api.delete(`/api/classes/${classId}/groups/${groupId}`)
  },
  listGroupMembers(classId: string, groupId: string) {
    return api.get<GroupMember[]>(`/api/classes/${classId}/groups/${groupId}/members`)
  },
  addGroupMember(classId: string, groupId: string, studentId: string) {
    return api.post<GroupMember>(
      `/api/classes/${classId}/groups/${groupId}/members/${studentId}`, {},
    )
  },
  removeGroupMember(classId: string, groupId: string, studentId: string) {
    return api.delete(`/api/classes/${classId}/groups/${groupId}/members/${studentId}`)
  },

  leaderboard(classId: string) {
    return api.get<ClassLeaderboardEntry[]>(`/api/classes/${classId}/leaderboard`)
  },
  report(classId: string) {
    return api.get<ClassReportRow[]>(`/api/classes/${classId}/report`)
  },
  reportCsvUrl(classId: string) {
    return `/api/classes/${classId}/report.csv`
  },
}
