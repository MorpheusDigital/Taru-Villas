import { describe, it, expect } from 'vitest'
import { planDispatches } from './engine'
import type { EngineInput, EngineRequest, EngineVehicle, EngineDriver } from './types'

const lorry: EngineVehicle = {
  id: 'v-lorry', name: 'Bolero Lorry', maxPassengers: 1, cargoCapable: true,
  isRestricted: false, status: 'active', currentLocationPropertyId: null, sortOrder: 0,
}
const car1: EngineVehicle = {
  id: 'v-car1', name: 'Car 1', maxPassengers: 4, cargoCapable: false,
  isRestricted: true, status: 'active', currentLocationPropertyId: null, sortOrder: 1,
}
const van: EngineVehicle = {
  id: 'v-van', name: 'Van', maxPassengers: 8, cargoCapable: false,
  isRestricted: false, status: 'active', currentLocationPropertyId: null, sortOrder: 2,
}

const drivers: EngineDriver[] = [
  { id: 'd-nimal', fullName: 'Nimal', isActive: true, vehicleIds: ['v-car1', 'v-van'] },
  { id: 'd-sunil', fullName: 'Sunil', isActive: true, vehicleIds: ['v-lorry', 'v-van'] },
]

// A second van, used only by the tests that need two clusters served at once.
const vanB: EngineVehicle = { ...van, id: 'v-van-b', name: 'Van B', sortOrder: 3 }
const bothVanDrivers: EngineDriver[] = [
  { id: 'd-nimal', fullName: 'Nimal', isActive: true, vehicleIds: ['v-van', 'v-van-b'] },
  { id: 'd-sunil', fullName: 'Sunil', isActive: true, vehicleIds: ['v-van', 'v-van-b'] },
]

// Two small (2-seat) cars, used only by the cluster-splitting test to prove
// that a cluster too big for the sole large vehicle can still be served by
// splitting it back into requests small enough for the small fleet.
const carSmall: EngineVehicle = {
  id: 'v-car-small', name: 'Small Car', maxPassengers: 2, cargoCapable: false,
  isRestricted: false, status: 'active', currentLocationPropertyId: null, sortOrder: 4,
}
const carSmallB: EngineVehicle = { ...carSmall, id: 'v-car-small-b', name: 'Small Car B', sortOrder: 5 }
const smallCarDrivers: EngineDriver[] = [
  { id: 'd-nimal', fullName: 'Nimal', isActive: true, vehicleIds: ['v-van', 'v-car-small', 'v-car-small-b'] },
  { id: 'd-sunil', fullName: 'Sunil', isActive: true, vehicleIds: ['v-van', 'v-car-small', 'v-car-small-b'] },
  { id: 'd-kamal', fullName: 'Kamal', isActive: true, vehicleIds: ['v-car-small', 'v-car-small-b'] },
]

function request(over: Partial<EngineRequest> & { id: string }): EngineRequest {
  return {
    requestType: 'visit',
    requestedById: 'u1',
    requesterCanUseRestricted: false,
    targetPropertyId: 'p1',
    destinationLabel: null,
    startDate: '2026-08-12',
    endDate: '2026-08-14',
    paxCount: 2,
    cargoRequired: false,
    ...over,
  }
}

function input(over: Partial<EngineInput>): EngineInput {
  return {
    requests: [],
    vehicles: [lorry, car1, van],
    drivers,
    distances: [
      { fromPropertyId: 'p1', toPropertyId: 'p2', distanceKm: 18 },
      { fromPropertyId: 'p1', toPropertyId: 'p3', distanceKm: 140 },
      { fromPropertyId: null, toPropertyId: 'p1', distanceKm: 65 },
      { fromPropertyId: null, toPropertyId: 'p2', distanceKm: 70 },
      { fromPropertyId: null, toPropertyId: 'p3', distanceKm: 200 },
    ],
    existingDispatches: [],
    settings: { poolingThresholdKm: 40, planningHorizonDays: 14 },
    today: '2026-08-10',
    ...over,
  }
}

describe('planDispatches', () => {
  it('assigns a single request to the smallest sufficient vehicle', () => {
    const r = planDispatches(input({ requests: [request({ id: 'r1', paxCount: 2 })] }))
    expect(r.unassignable).toEqual([])
    expect(r.drafts).toHaveLength(1)
    // Car 1 is restricted and the requester is not privileged, so the van wins.
    expect(r.drafts[0].vehicleId).toBe('v-van')
    expect(r.drafts[0].stops.map((s) => s.requestId)).toEqual(['r1'])
  })

  it('never sends the cargo-capable vehicle on a plain passenger trip when a non-cargo vehicle is free', () => {
    // Fleet has only two vehicles: the 1-seat cargo lorry and the 8-seat
    // van. Ranking by raw maxPassengers ascending would put the lorry
    // first ("smallest that fits"); the fix must instead push cargo-capable
    // vehicles to the back of the ranking whenever the trip does not need
    // cargo capacity, so the van is chosen and the lorry stays free for an
    // actual cargo request.
    const r = planDispatches(input({
      vehicles: [lorry, van],
      requests: [request({ id: 'r1', paxCount: 1 })],
    }))
    expect(r.drafts).toHaveLength(1)
    expect(r.drafts[0].vehicleId).toBe('v-van')
  })

  it('pools two nearby overlapping visits into one dispatch with two stops', () => {
    const r = planDispatches(input({
      requests: [
        request({ id: 'r1', targetPropertyId: 'p1', paxCount: 2 }),
        request({ id: 'r2', targetPropertyId: 'p2', paxCount: 3 }),
      ],
    }))
    expect(r.drafts).toHaveLength(1)
    expect(r.drafts[0].stops.map((s) => s.requestId)).toEqual(['r1', 'r2'])
    expect(r.drafts[0].stops.map((s) => s.sortOrder)).toEqual([0, 1])
  })

  // The default fixture has exactly ONE vehicle a non-privileged 2-pax request
  // can use (the lorry seats 1, Car 1 is restricted), so two unpooled clusters
  // could not both be served and the second would land in `unassignable` for a
  // reason that has nothing to do with distance. These two tests therefore
  // supply two interchangeable vans and drivers licensed for both, isolating
  // the clustering decision from vehicle scarcity. Asserting `unassignable` is
  // empty is what makes them strict: two drafts AND nothing dropped.
  it('refuses to pool destinations beyond the distance threshold', () => {
    const r = planDispatches(input({
      vehicles: [van, vanB],
      drivers: bothVanDrivers,
      requests: [
        request({ id: 'r1', targetPropertyId: 'p1' }),
        request({ id: 'r2', targetPropertyId: 'p3' }),
      ],
    }))
    expect(r.unassignable).toEqual([])
    expect(r.drafts).toHaveLength(2)
  })

  it('refuses to pool when the distance pair is unknown', () => {
    const r = planDispatches(input({
      vehicles: [van, vanB],
      drivers: bothVanDrivers,
      requests: [
        request({ id: 'r1', targetPropertyId: 'p1' }),
        request({ id: 'r2', targetPropertyId: 'p-unknown' }),
      ],
    }))
    expect(r.unassignable).toEqual([])
    expect(r.drafts).toHaveLength(2)
  })

  it('refuses to pool non-overlapping windows', () => {
    const r = planDispatches(input({
      requests: [
        request({ id: 'r1', targetPropertyId: 'p1', startDate: '2026-08-12', endDate: '2026-08-13' }),
        request({ id: 'r2', targetPropertyId: 'p2', startDate: '2026-08-15', endDate: '2026-08-16' }),
      ],
    }))
    expect(r.drafts).toHaveLength(2)
  })

  it('does not chain non-overlapping windows through a shared middle request', () => {
    // r1 (12–14) and r2 (14–16) directly overlap on the 14th, so they
    // cluster. r3 (16–18) overlaps r2 (on the 16th) but NOT r1 — if
    // admission were tested against the cluster's running UNION window
    // (12–16) rather than every individual member, r3 would wrongly join
    // too, chaining all three into one dispatch spanning 12–18 even though
    // r1 and r3 share no day. Two vans isolate this from vehicle scarcity.
    const r = planDispatches(input({
      vehicles: [van, vanB],
      drivers: bothVanDrivers,
      requests: [
        request({ id: 'r1', targetPropertyId: 'p1', startDate: '2026-08-12', endDate: '2026-08-14' }),
        request({ id: 'r2', targetPropertyId: 'p1', startDate: '2026-08-14', endDate: '2026-08-16' }),
        request({ id: 'r3', targetPropertyId: 'p1', startDate: '2026-08-16', endDate: '2026-08-18' }),
      ],
    }))
    expect(r.unassignable).toEqual([])
    expect(r.drafts).toHaveLength(2)
    const draftWithR1 = r.drafts.find((d) => d.stops.some((s) => s.requestId === 'r1'))
    expect(draftWithR1?.stops.map((s) => s.requestId)).toEqual(['r1', 'r2'])
    expect(draftWithR1?.endDate).toBe('2026-08-16')
    const draftWithR3 = r.drafts.find((d) => d.stops.some((s) => s.requestId === 'r3'))
    expect(draftWithR3?.stops.map((s) => s.requestId)).toEqual(['r3'])
  })

  it('splits an unallocatable cluster into singletons instead of dropping every request in it', () => {
    // r1 (targetPropertyId p1) and r2 (p2) are close enough (18km) and
    // overlap in window, so they cluster into one 4-pax group. The only
    // vehicle that could seat 4 (the van) is already busy on an unrelated
    // existing dispatch for the same window — but two spare 2-seat cars
    // could each serve one of them alone. The fix must split the stuck
    // cluster back into r1/r2 singletons and retry each independently
    // rather than declaring both unassignable.
    const r = planDispatches(input({
      vehicles: [van, carSmall, carSmallB],
      drivers: smallCarDrivers,
      existingDispatches: [
        { id: 'x1', vehicleId: 'v-van', driverId: 'd-nimal', startDate: '2026-08-12', endDate: '2026-08-14' },
      ],
      requests: [
        request({ id: 'r1', targetPropertyId: 'p1', paxCount: 2 }),
        request({ id: 'r2', targetPropertyId: 'p2', paxCount: 2 }),
      ],
    }))
    expect(r.unassignable).toEqual([])
    expect(r.drafts).toHaveLength(2)
    expect(r.drafts.every((d) => d.stops.length === 1)).toBe(true)
    expect(r.drafts.map((d) => d.vehicleId).sort()).toEqual(['v-car-small', 'v-car-small-b'])
  })

  it('distinguishes "only restricted vehicles available" from a genuine capacity shortage', () => {
    // Car 1 (4 seats) could easily carry 2 passengers and is completely
    // free — it's excluded only because it's restricted and the requester
    // is not privileged. The dispatcher should be told that, not given the
    // generic "no vehicle seats 2" message that implies nothing on the lot
    // could have done the job.
    const r = planDispatches(input({
      vehicles: [car1],
      requests: [request({ id: 'r1', paxCount: 2 })],
    }))
    expect(r.drafts).toEqual([])
    expect(r.unassignable).toEqual([
      {
        requestId: 'r1',
        reason: 'No available vehicle for 2 free 12 Aug–14 Aug — the only candidates are restricted',
      },
    ])
  })

  it("clamps a straddling window's draft start date to today, not the elapsed start", () => {
    // The request started two days before "today" and is still running —
    // it must not be filtered as past-due (endDate >= today), but the
    // resulting draft should not claim the vehicle for days that have
    // already elapsed.
    const r = planDispatches(input({
      requests: [request({ id: 'r1', startDate: '2026-08-05', endDate: '2026-08-12', paxCount: 2 })],
    }))
    expect(r.unassignable).toEqual([])
    expect(r.drafts).toHaveLength(1)
    expect(r.drafts[0].startDate).toBe('2026-08-10')
    expect(r.drafts[0].endDate).toBe('2026-08-12')
  })

  it('splits a cluster that would exceed the largest vehicle', () => {
    const r = planDispatches(input({
      requests: [
        request({ id: 'r1', targetPropertyId: 'p1', paxCount: 6 }),
        request({ id: 'r2', targetPropertyId: 'p2', paxCount: 6 }),
      ],
    }))
    expect(r.drafts).toHaveLength(1)
    expect(r.drafts[0].stops.map((s) => s.requestId)).toEqual(['r1'])
    // Only one van exists, so the second cluster has no vehicle left.
    expect(r.unassignable).toEqual([
      { requestId: 'r2', reason: 'No vehicle seating 6 free 12 Aug–14 Aug' },
    ])
  })

  it('never pools a cargo request', () => {
    const r = planDispatches(input({
      requests: [
        request({ id: 'r1', targetPropertyId: 'p1', paxCount: 1, cargoRequired: true }),
        request({ id: 'r2', targetPropertyId: 'p2', paxCount: 1 }),
      ],
    }))
    expect(r.drafts).toHaveLength(2)
    const cargoDraft = r.drafts.find((d) => d.stops.some((s) => s.requestId === 'r1'))
    expect(cargoDraft?.vehicleId).toBe('v-lorry')
    expect(cargoDraft?.driverId).toBe('d-sunil')
  })

  it('never pools a standalone request, even when it is within distance of a visit', () => {
    // With the default distances, p1↔head-office is 65km — over the 40km
    // threshold — so a naive read of this test would pass even with the
    // requestType==='visit' guard deleted from poolable(), because distance
    // alone would already refuse the pair. Overriding p1↔HO to 20km removes
    // that confound: now only the standalone-specific rule can produce two
    // separate drafts instead of one 2-stop dispatch.
    const r = planDispatches(input({
      distances: [{ fromPropertyId: null, toPropertyId: 'p1', distanceKm: 20 }],
      requests: [
        request({ id: 'r1', targetPropertyId: 'p1', paxCount: 1 }),
        request({
          id: 'r2', requestType: 'standalone', targetPropertyId: null,
          destinationLabel: 'Bandaranaike Airport', paxCount: 1,
        }),
      ],
    }))
    expect(r.drafts).toHaveLength(2)
    const standalone = r.drafts.find((d) => d.stops.some((s) => s.requestId === 'r2'))
    expect(standalone?.stops).toHaveLength(1)
    expect(standalone?.stops[0].label).toBe('Bandaranaike Airport')
    expect(standalone?.stops[0].propertyId).toBeNull()
  })

  it('allows a restricted vehicle when a privileged requester is aboard', () => {
    const r = planDispatches(input({
      vehicles: [car1],
      requests: [request({ id: 'r1', paxCount: 2, requesterCanUseRestricted: true })],
    }))
    expect(r.drafts).toHaveLength(1)
    expect(r.drafts[0].vehicleId).toBe('v-car1')
  })

  it('reports no cargo vehicle in plain English', () => {
    const r = planDispatches(input({
      vehicles: [van],
      requests: [request({ id: 'r1', paxCount: 1, cargoRequired: true })],
    }))
    expect(r.drafts).toEqual([])
    expect(r.unassignable).toEqual([
      { requestId: 'r1', reason: 'No cargo-capable vehicle free 12 Aug–14 Aug' },
    ])
  })

  it('reports a missing licensed driver separately from a missing vehicle', () => {
    const r = planDispatches(input({
      vehicles: [lorry],
      drivers: [{ id: 'd-nimal', fullName: 'Nimal', isActive: true, vehicleIds: ['v-car1'] }],
      requests: [request({ id: 'r1', paxCount: 1, cargoRequired: true })],
    }))
    expect(r.unassignable).toEqual([
      { requestId: 'r1', reason: 'No licensed driver available 12 Aug–14 Aug' },
    ])
  })

  it('excludes a vehicle already committed to an approved dispatch', () => {
    const r = planDispatches(input({
      vehicles: [van],
      requests: [request({ id: 'r1', paxCount: 2 })],
      existingDispatches: [
        { id: 'x1', vehicleId: 'v-van', driverId: 'd-nimal', startDate: '2026-08-13', endDate: '2026-08-15' },
      ],
    }))
    expect(r.drafts).toEqual([])
    expect(r.unassignable[0].reason).toBe('No vehicle seating 2 free 12 Aug–14 Aug')
  })

  it('does not reuse a vehicle across two drafts in the same run', () => {
    const r = planDispatches(input({
      vehicles: [van],
      requests: [
        request({ id: 'r1', targetPropertyId: 'p1', paxCount: 2 }),
        request({ id: 'r2', targetPropertyId: 'p3', paxCount: 2 }),
      ],
    }))
    expect(r.drafts).toHaveLength(1)
    expect(r.unassignable).toHaveLength(1)
  })

  // Both drivers are licensed for the van and neither is busy in the request
  // window, so licence and availability cannot decide it — only load can.
  // The second case is the one that matters: 'd-nimal' sorts first
  // alphabetically, so if load were ignored it would win by the id tiebreak.
  it('gives the trip to the less-loaded driver when Sunil is busier', () => {
    const r = planDispatches(input({
      vehicles: [van],
      requests: [request({ id: 'r1', paxCount: 2 })],
      existingDispatches: [
        { id: 'x1', vehicleId: 'v-lorry', driverId: 'd-sunil', startDate: '2026-08-20', endDate: '2026-08-20' },
      ],
    }))
    expect(r.drafts).toHaveLength(1)
    expect(r.drafts[0].driverId).toBe('d-nimal')
  })

  it('gives the trip to the less-loaded driver when Nimal is busier', () => {
    const r = planDispatches(input({
      vehicles: [van],
      requests: [request({ id: 'r1', paxCount: 2 })],
      existingDispatches: [
        { id: 'x1', vehicleId: 'v-car1', driverId: 'd-nimal', startDate: '2026-08-20', endDate: '2026-08-20' },
      ],
    }))
    expect(r.drafts).toHaveLength(1)
    expect(r.drafts[0].driverId).toBe('d-sunil')
  })

  it('never double-books a driver even when a busier driver would otherwise look free', () => {
    // Nimal is busy in r1's exact window, but on a DIFFERENT vehicle
    // (Car 1) — proving the busy check is keyed on driver id, not vehicle.
    // Sunil is free in that window but carries two prior out-of-window
    // bookings, giving him the higher load. If the `busy.driverIds` filter
    // were removed, the load-ascending tiebreak alone would hand the trip
    // to the (still busy) Nimal — a real double-booking.
    const r = planDispatches(input({
      vehicles: [van],
      requests: [request({ id: 'r1', paxCount: 2, startDate: '2026-08-12', endDate: '2026-08-14' })],
      existingDispatches: [
        { id: 'x1', vehicleId: 'v-car1', driverId: 'd-nimal', startDate: '2026-08-12', endDate: '2026-08-14' },
        { id: 'x2', vehicleId: 'v-lorry', driverId: 'd-sunil', startDate: '2026-08-20', endDate: '2026-08-20' },
        { id: 'x3', vehicleId: 'v-lorry', driverId: 'd-sunil', startDate: '2026-08-21', endDate: '2026-08-21' },
      ],
    }))
    expect(r.drafts).toHaveLength(1)
    expect(r.drafts[0].driverId).toBe('d-sunil')
  })

  it('flags requests whose window has already passed', () => {
    const r = planDispatches(input({
      requests: [request({ id: 'r1', startDate: '2026-08-01', endDate: '2026-08-02' })],
    }))
    expect(r.drafts).toEqual([])
    expect(r.unassignable).toEqual([
      { requestId: 'r1', reason: 'Window 1 Aug–2 Aug has already passed' },
    ])
  })

  it('leaves requests beyond the planning horizon untouched', () => {
    const r = planDispatches(input({
      requests: [request({ id: 'r1', startDate: '2026-09-20', endDate: '2026-09-21' })],
    }))
    expect(r.drafts).toEqual([])
    expect(r.unassignable).toEqual([])
  })

  it('is deterministic across repeated runs and independent of input request order', () => {
    const build = () => input({
      requests: [
        request({ id: 'r2', targetPropertyId: 'p2', paxCount: 2 }),
        request({ id: 'r1', targetPropertyId: 'p3', paxCount: 2 }),
      ],
    })
    // Same input, called twice: catches Math.random()/Date.now()-style
    // hidden state.
    expect(planDispatches(build())).toEqual(planDispatches(build()))

    // Same requests, opposite array order: neither r1/p3 nor r2/p2 pool
    // with each other (p2↔p3 distance is unknown) or fit in more than one
    // non-restricted vehicle in the default fixture, so whichever request
    // is processed first wins the van and the other becomes unassignable.
    // If `candidates.sort(...)` were removed, "first" would mean "first in
    // the input array" and reversing the array would swap which request
    // gets a draft and which is reported unassignable — a real dependency
    // on database row order.
    const reversedBuild = () => input({
      requests: [
        request({ id: 'r1', targetPropertyId: 'p3', paxCount: 2 }),
        request({ id: 'r2', targetPropertyId: 'p2', paxCount: 2 }),
      ],
    })
    expect(planDispatches(build())).toEqual(planDispatches(reversedBuild()))
  })
})
