// src/lib/oracle/client.ts
import type { OhipResult, NormalizedArrival, NormalizedReservation } from './types'
import { normalizeArrival, normalizeReservation } from './reservations'

interface Cached { token: string; expiresAt: number }
let cached: Cached | null = null

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function env() {
  const gateway = process.env.ORACLE_OHIP_GATEWAY
  const clientId = process.env.ORACLE_OHIP_CLIENT_ID
  const clientSecret = process.env.ORACLE_OHIP_CLIENT_SECRET
  const appKey = process.env.ORACLE_OHIP_APP_KEY
  const username = process.env.ORACLE_OHIP_USERNAME
  const password = process.env.ORACLE_OHIP_PASSWORD
  if (!gateway || !clientId || !clientSecret || !appKey || !username || !password) return null
  return { gateway, clientId, clientSecret, appKey, username, password }
}

async function getAccessToken(): Promise<OhipResult<string>> {
  const cfg = env()
  if (!cfg) return { ok: false, status: 500, error: 'Oracle OHIP not configured' }
  if (cached && cached.expiresAt > Date.now() + 60_000) return { ok: true, data: cached.token }

  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')
  const body = new URLSearchParams({
    grant_type: 'password',
    username: cfg.username,
    password: cfg.password,
  })
  const res = await fetch(`${cfg.gateway}/oauth/v1/tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'x-app-key': cfg.appKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    console.error('OHIP token error', res.status, t)
    return { ok: false, status: 502, error: 'OHIP authentication failed' }
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) return { ok: false, status: 502, error: 'OHIP returned no token' }
  cached = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 }
  return { ok: true, data: cached.token }
}

async function ohipRequest<T>(
  path: string,
  init: RequestInit & { method: string }
): Promise<OhipResult<T>> {
  const cfg = env()
  if (!cfg) return { ok: false, status: 500, error: 'Oracle OHIP not configured' }
  const tok = await getAccessToken()
  if (!tok.ok) return tok
  const res = await fetch(`${cfg.gateway}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${tok.data}`,
      'x-app-key': cfg.appKey,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    console.error('OHIP request error', init.method, path, res.status, t)
    return { ok: false, status: res.status === 404 ? 404 : 502, error: `OHIP ${res.status}` }
  }
  const data = (res.status === 204 ? null : await res.json()) as T
  return { ok: true, data }
}

/** List reservations arriving in [fromDate, toDate] for a hotel. */
export async function listArrivals(
  hotelId: string,
  fromDate: string,
  toDate: string,
  opts: { limit?: number; offset?: number } = {}
): Promise<OhipResult<NormalizedArrival[]>> {
  const qs = new URLSearchParams({
    arrivalStartDate: fromDate,
    arrivalEndDate: toDate,
    limit: String(opts.limit ?? 200),
    offset: String(opts.offset ?? 0),
  })
  const res = await ohipRequest<unknown>(`/rsv/v1/hotels/${hotelId}/reservations?${qs}`, {
    method: 'GET',
  })
  if (!res.ok) return res
  // PIN: the array key under the envelope is confirmed against the sandbox.
  const data = asRecord(res.data)
  const reservations = data.reservations
  const reservationEnvelope = asRecord(reservations)
  const list = asArray(
    reservationEnvelope.reservation
    ?? reservations
    ?? data.hotelReservations
  )
  return { ok: true, data: list.map(normalizeArrival).filter((a) => a.oracleReservationId) }
}

/** Fetch one reservation (status + assigned room). */
export async function getReservation(
  hotelId: string,
  reservationId: string
): Promise<OhipResult<NormalizedReservation>> {
  const res = await ohipRequest<unknown>(
    `/rsv/v1/hotels/${hotelId}/reservations/${reservationId}`,
    { method: 'GET' }
  )
  if (!res.ok) return res
  return { ok: true, data: normalizeReservation(res.data) }
}

/**
 * Post pre-arrival info: fetch the reservation, append a comment + set ETA, PUT it back.
 * Plan 2 builds {eta, comment}; the exact PUT body merge is PINNED against the sandbox.
 */
export async function postPreArrival(
  hotelId: string,
  reservationId: string,
  _payload: { eta: string | null; comment: string }
): Promise<OhipResult<true>> {
  const current = await ohipRequest<unknown>(
    `/rsv/v1/hotels/${hotelId}/reservations/${reservationId}`,
    { method: 'GET' }
  )
  if (!current.ok) return current
  const body = current.data
  // PIN: merge comment + ETA into the reservation body per the sandbox shape.
  const put = await ohipRequest<unknown>(
    `/rsv/v1/hotels/${hotelId}/reservations/${reservationId}`,
    { method: 'PUT', body: JSON.stringify(body) }
  )
  if (!put.ok) return put
  return { ok: true, data: true }
}

/**
 * Verify OHIP is configured and the credentials can obtain an access token.
 * Returns ok on success; the token itself is never exposed to callers.
 */
export async function testConnection(): Promise<OhipResult<true>> {
  const tok = await getAccessToken()
  if (!tok.ok) return tok
  return { ok: true, data: true }
}
