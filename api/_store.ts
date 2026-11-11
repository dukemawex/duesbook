import { Redis } from '@upstash/redis'
import { createHash, randomBytes } from 'node:crypto'

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN

export const redis = url && token ? new Redis({ url, token }) : null
export const KEY = (id: string) => `duesbook:group:${id}`
export const ADMIN_KEY = (id: string) => `duesbook:admin:${id}`

const ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
export function newGroupId(): string {
  const bytes = randomBytes(8)
  let s = ''
  for (const b of bytes) s += ID_ALPHABET[b % ID_ALPHABET.length]
  return s
}
export function newAdminToken(): string {
  return randomBytes(24).toString('base64url')
}
export function hashToken(t: string): string {
  return createHash('sha256').update(t).digest('hex')
}
export function json(res: any, status: number, body: unknown) {
  res.status(status).setHeader('content-type', 'application/json').setHeader('cache-control', 'no-store')
  res.send(JSON.stringify(body))
}
