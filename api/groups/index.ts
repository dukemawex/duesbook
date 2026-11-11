import type { VercelRequest, VercelResponse } from '@vercel/node'
import { validateDraft, normalizeAddress, type Group } from '../../src/lib/core.js'
import { redis, KEY, ADMIN_KEY, newGroupId, newAdminToken, hashToken, json } from '../_store.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Use POST' })
  if (!redis) return json(res, 503, { error: 'Storage is not configured' })
  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body
  const err = validateDraft(body)
  if (err) return json(res, 400, { error: err })

  let id = newGroupId()
  for (let i = 0; i < 3 && (await redis.exists(KEY(id))); i++) id = newGroupId()
  const now = Date.now()
  const group: Group = {
    id,
    name: body.name.trim(),
    payee: normalizeAddress(body.payee),
    amountLuna: body.amountLuna,
    cadence: body.cadence,
    start: body.start,
    members: body.members.map((m: any, i: number) => ({ id: i + 1, name: String(typeof m === 'string' ? m : m.name).trim() })),
    network: body.network,
    note: body.note ? String(body.note).trim() : undefined,
    createdAt: now,
    updatedAt: now,
  }
  const adminToken = newAdminToken()
  await redis.set(KEY(id), group)
  await redis.set(ADMIN_KEY(id), hashToken(adminToken))
  await redis.incr('duesbook:stats:groups')
  return json(res, 201, { group, adminToken })
}

function safeParse(s: string) {
  try { return JSON.parse(s) } catch { return null }
}
