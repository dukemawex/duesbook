// Small device-local memory (no server): groups you opened, your member identity, treasurer tokens.
const K = 'duesbook:v1'
interface LocalState {
  groups: Record<string, { name: string; lastSeen: number; memberId?: number; adminToken?: string }>
}
function read(): LocalState {
  try {
    return JSON.parse(localStorage.getItem(K) || '') as LocalState
  } catch {
    return { groups: {} }
  }
}
function write(s: LocalState) {
  try { localStorage.setItem(K, JSON.stringify(s)) } catch { /* private mode */ }
}
export function rememberGroup(id: string, name: string, patch: { memberId?: number; adminToken?: string } = {}) {
  const s = read()
  s.groups ||= {}
  s.groups[id] = { ...(s.groups[id] || {}), name, lastSeen: Date.now(), ...patch }
  write(s)
}
export function localGroup(id: string) {
  return read().groups?.[id]
}
export function forgetMember(id: string) {
  const s = read()
  if (s.groups?.[id]) { delete s.groups[id].memberId; write(s) }
}
export function recentGroups() {
  const g = read().groups || {}
  return Object.entries(g).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.lastSeen - a.lastSeen)
}
