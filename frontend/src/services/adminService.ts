import { api } from './api'

export interface UserSummary {
  id: string
  email: string
  player_name: string
  role: string
  is_active: boolean
  created_at: string | null
  classes_joined_count: number
}

export interface ClassSummary {
  id: string
  name: string
  teacher_id: string
  join_code: string
  created_at: string
  student_count: number
}

interface Paginated<T> {
  items: T[]
  total: number
}

export interface CreateTeacherPayload {
  email: string
  password: string
  player_name: string
}

export const adminService = {
  async getTeachers(signal?: AbortSignal): Promise<UserSummary[]> {
    const res = await api.get<Paginated<UserSummary>>('/api/admin/teachers', { signal })
    return res.items
  },
  async getClasses(signal?: AbortSignal): Promise<ClassSummary[]> {
    const res = await api.get<Paginated<ClassSummary>>('/api/admin/classes', { signal })
    return res.items
  },
  async getStudents(signal?: AbortSignal): Promise<UserSummary[]> {
    const res = await api.get<Paginated<UserSummary>>('/api/admin/students', { signal })
    return res.items
  },
  async createTeacher(payload: CreateTeacherPayload): Promise<UserSummary> {
    return await api.post<UserSummary>('/api/admin/teachers', payload)
  },
}
