import { api } from './api'

export interface ClassInfo {
  id: string
  name: string
  teacher_id: string
  join_code?: string
  created_at: string
}

export interface Membership {
  id: string
  class_id: string
  student_id: string
  joined_at: string
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
  addStudent(classId: string, studentId: string) {
    return api.post<Membership>(`/api/classes/${classId}/students`, { student_id: studentId })
  },
  removeStudent(classId: string, studentId: string) {
    return api.delete<void>(`/api/classes/${classId}/students/${studentId}`)
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
