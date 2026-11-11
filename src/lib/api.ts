import type { Group } from './core'

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } })
  } catch {
    throw new Error('Could not reach DuesBook. Check your connection and try again.')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `Request failed (HTTP ${res.status})`)
  return body as T
}
export const getGroup = (id: string) => call<{ group: Group }>(`/api/groups/${id}`)
export const createGroup = (draft: unknown) => call<{ group: Group; adminToken: string }>('/api/groups', { method: 'POST', body: JSON.stringify(draft) })
export const updateGroup = (id: string, token: string, patch: unknown) =>
  call<{ group: Group }>(`/api/groups/${id}`, { method: 'PUT', body: JSON.stringify(patch), headers: { authorization: `Bearer ${token}` } })
