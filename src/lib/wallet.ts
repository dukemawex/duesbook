import { init, NimiqProviderError, getHostNetwork } from '@nimiq/mini-app-sdk'
import type { Network } from './core'

type Provider = Awaited<ReturnType<typeof init>>
let providerPromise: Promise<Provider | null> | null = null

export function inNimiqPay(): boolean {
  return typeof window !== 'undefined' && !!(window as any).nimiqPay
}

export function hostNetwork(): Network | undefined {
  try {
    return getHostNetwork() ?? undefined
  } catch {
    return undefined
  }
}

export function provider(): Promise<Provider | null> {
  if (!providerPromise) {
    providerPromise = init({ timeout: inNimiqPay() ? 10_000 : 1_500 }).catch(() => null)
  }
  return providerPromise
}

export function explainError(e: unknown): string {
  if (NimiqProviderError.is(e)) {
    switch (e.type) {
      case 'PERMISSION_DENIED': return 'You cancelled the request in Nimiq Pay. Nothing was sent.'
      case 'INVALID_TRANSACTION': return 'Nimiq Pay rejected the payment details: ' + e.message
      case 'NETWORK_ERROR': return 'Network problem while sending. Check the register before paying again: ' + e.message
      case 'UNKNOWN_REQUEST': return 'This Nimiq Pay version does not support that request. Please update Nimiq Pay.'
      default: return `${e.type}: ${e.message}`
    }
  }
  return e instanceof Error ? e.message : String(e)
}
