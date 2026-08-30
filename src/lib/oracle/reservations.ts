// src/lib/oracle/reservations.ts
import type { NormalizedArrival, NormalizedReservation } from './types'

const CHECKED_IN = new Set(['arrived', 'inhouse', 'registeredandinhouse', 'checkedin', 'checked in'])
const CANCELLED = new Set(['cancellation', 'cancelled', 'noshow', 'no show'])

/** Map a raw OPERA reservation status to our lifecycle transition class. */
export function classifyOracleStatus(
  raw: string | null | undefined
): 'checked_in' | 'cancelled' | 'other' {
  if (!raw) return 'other'
  const k = raw.toLowerCase().replace(/[\s_-]/g, '')
  if (CHECKED_IN.has(k) || CHECKED_IN.has(raw.toLowerCase())) return 'checked_in'
  if (CANCELLED.has(k) || CANCELLED.has(raw.toLowerCase())) return 'cancelled'
  return 'other'
}

// ---- Raw-shape access (PIN against sandbox responses) -----------------------
// OPERA wraps a reservation in nested objects; these readers defensively walk
// the documented shape and must be confirmed against a real sandbox payload.

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : {}
}

/** Normalize one reservation object from getHotelReservations / getReservation. */
export function normalizeArrival(raw: unknown): NormalizedArrival {
  const root = asRecord(raw)
  const r = asRecord(root.reservation ?? raw)
  const ids = r.reservationIdList ?? r.resvNameId ?? []
  const firstId = Array.isArray(ids) ? asRecord(ids[0]).id : asRecord(ids).id
  const oracleReservationId =
    asString(firstId) ??
    asString(r.reservationId) ??
    asString(r.id) ??
    ''
  const profile = asRecord(r.reservationGuest ?? r.guestProfile ?? r.profile)
  const name = profile.givenName || profile.surname
    ? `${asString(profile.givenName) ?? ''} ${asString(profile.surname) ?? ''}`.trim()
    : asString(profile.fullName)
  const roomStay = asRecord(r.roomStay)
  return {
    oracleReservationId,
    confirmationNumber: asString(r.confirmationNumber) ?? asString(r.confirmationNo),
    guestName: name || null,
    guestEmail: asString(profile.email) ?? asString(profile.emailAddress),
    arrivalDate: asString(roomStay.arrivalDate) ?? asString(r.arrivalDate),
    departureDate: asString(roomStay.departureDate) ?? asString(r.departureDate),
    roomType: asString(roomStay.roomType) ?? asString(roomStay.roomTypeCharged),
  }
}

/** Normalize a full reservation, adding status + assigned room. */
export function normalizeReservation(raw: unknown): NormalizedReservation {
  const base = normalizeArrival(raw)
  const root = asRecord(raw)
  const r = asRecord(root.reservation ?? raw)
  const roomStay = asRecord(r.roomStay)
  const currentRoomInfo = asRecord(roomStay.currentRoomInfo)
  const status =
    asString(r.reservationStatus) ??
    asString(r.computedReservationStatus) ??
    asString(roomStay.reservationStatus)
  const roomNumber =
    asString(currentRoomInfo.roomId) ??
    asString(roomStay.roomId) ??
    asString(currentRoomInfo.roomNumber)
  return { ...base, reservationStatus: status, roomNumber }
}
