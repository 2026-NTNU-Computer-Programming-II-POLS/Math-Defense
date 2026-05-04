import { api } from './api'

export interface ClassInfo {
  id: string
  name: string
  teacher_id: string
  join_code?: string
  created_at: string
  teacher_player_name?: string
}

export interface Membership {
  id: string
  class_id: string
  student_id: string
  joined_at: string
  player_name: string
  email: string
}

export const classService = {
  createClass(name: string) {
    return api.post<ClassInfo>('/api/classes', { name })
  },
  listClasses() {
    return api.get<ClassInfo[]>('/api/classes')
  },
  getClass(id: string) {
    return api.get<ClassInfo>(`/api/classes/${id}`)
  },
  renameClass(classId: string, name: string) {
    return api.put<ClassInfo>(`/api/classes/${classId}`, { name })
  },
  deleteClass(classId: string) {
    return api.delete(`/api/classes/${classId}`)
  },
  addStudent(classId: string, email: string) {
    return api.post<Membership>(`/api/classes/${classId}/students`, { email })
  },
  removeStudent(classId: string, studentId: string) {
    return api.delete(`/api/classes/${classId}/students/${studentId}`)
  },
  listStudents(classId: string) {
    return api.get<Membership[]>(`/api/classes/${classId}/students`)
  },
  joinByCode(code: string) {
    return api.post<Membership>('/api/classes/join', { code })
  },
  regenerateCode(classId: string) {
    return api.post<{ join_code: string }>(`/api/classes/${classId}/regenerate-code`, {})
  },
}
