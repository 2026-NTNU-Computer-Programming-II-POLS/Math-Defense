import { api } from './api'

export interface UserSummary {
  id: string
  email: string
  player_name: string
  role: string
  created_at: string | null
}

export interface ClassSummary {
  id: string
  name: string
  teacher_id: string
  join_code: string
  created_at: string
}

export const adminService = {
  getTeachers(signal?: AbortSignal) {
    return api.get<UserSummary[]>('/api/admin/teachers', { signal })
  },
  getClasses(signal?: AbortSignal) {
    return api.get<ClassSummary[]>('/api/admin/classes', { signal })
  },
  getStudents(signal?: AbortSignal) {
    return api.get<UserSummary[]>('/api/admin/students', { signal })
  },
}
