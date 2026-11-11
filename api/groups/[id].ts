import type { VercelRequest, VercelResponse } from '@vercel/node'
import { validateDraft, normalizeAddress, type Group, type Member } from '../../src/lib/core.js'
import { redis, KEY, ADMIN_KEY, hashToken, json } from '../_store.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!redis) return json(res, 503, { error: 'Storage is not configured' })
  const id = String(req.query.id || '')
  if (!/^[a-z0-9]{8}$/.test(id)) return json(res, 400, { error: 'Invalid group code' })
  const group = await redis.get<Group>(KEY(id))
  if (!group) return json(res, 404, { error: 'Group not found' })

  if (req.method === 'GET') return json(res, 200, { group })

  if (req.method === 'PUT') {
    const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    const stored = await redis.get<string>(ADMIN_KEY(id))
    if (!auth || !stored || hashToken(auth) !== stored) return json(res, 403, { error: 'Only the treasurer device that created this group can edit it' })
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    // Network, payee-side cadence and start are fixed after creation so the ledger stays consistent.
    const draft = { ...group, name: body?.name ?? group.name, note: body?.note ?? group.note, members: body?.members ?? group.members }
    const err = validateDraft(draft)
    if (err) return json(res, 400, { error: err })
    // Keep existing member ids stable; new names get fresh ids.
    let maxId = group.members.reduce((m, x) => Math.max(m, x.id), 0)
    const members: Member[] = draft.members.map((m: any) => {
      if (typeof m === 'object' && Number.isInteger(m.id) && group.members.some((g) => g.id === m.id)) return { id: m.id, name: String(m.name).trim() }
      return { id: ++maxId, name: String(typeof m === 'string' ? m : m.name).trim() }
    })
    const updated: Group = { ...group, name: draft.name.trim(), note: draft.note ? String(draft.note).trim() : undefined, members, payee: normalizeAddress(group.payee), updatedAt: Date.now() }
    await redis.set(KEY(id), updated)
    return json(res, 200, { group: updated })
  }
  return json(res, 405, { error: 'Use GET or PUT' })
}
