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

// Backend caps per_page at 200 (admin.py) and the admin panel filters
// client-side, so we accumulate every page to keep search coherent — fetching
// only page 1 would silently hide rows past the first 50. Realistic rosters
// fit in a single page; the loop only fans out when total > 200. The list
// endpoints are rate-limited at 30/min (limiter.py), so a roster past ~6k rows
// would 429 mid-accumulation — a visible error, not silent truncation. The
// answer at that scale is server-side search/pagination, not a bigger client
// fetch. MAX_PAGES is purely an infinite-loop guard against a backend that
// keeps returning full pages with an inconsistent `total`.
const PAGE_SIZE = 200
const MAX_PAGES = 50

async function fetchAllPages<T>(basePath: string, signal?: AbortSignal): Promise<T[]> {
  const items: T[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const query = new URLSearchParams({ page: String(page), per_page: String(PAGE_SIZE) })
    const res = await api.get<Paginated<T>>(`${basePath}?${query}`, { signal })
    items.push(...res.items)
    if (res.items.length === 0 || items.length >= res.total) break
  }
  return items
}

export const adminService = {
  getTeachers(signal?: AbortSignal): Promise<UserSummary[]> {
    return fetchAllPages<UserSummary>('/api/admin/teachers', signal)
  },
  getClasses(signal?: AbortSignal): Promise<ClassSummary[]> {
    return fetchAllPages<ClassSummary>('/api/admin/classes', signal)
  },
  getStudents(signal?: AbortSignal): Promise<UserSummary[]> {
    return fetchAllPages<UserSummary>('/api/admin/students', signal)
  },
  async createTeacher(payload: CreateTeacherPayload): Promise<UserSummary> {
    return await api.post<UserSummary>('/api/admin/teachers', payload)
  },
  async setUserActive(userId: string, isActive: boolean): Promise<UserSummary> {
    return await api.patch<UserSummary>(`/api/admin/users/${userId}/active`, { is_active: isActive })
  },
}
