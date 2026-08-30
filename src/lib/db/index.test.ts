import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getCloudflareContext: vi.fn(),
  postgres: vi.fn(),
  drizzle: vi.fn(),
}))

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: mocks.getCloudflareContext,
}))

vi.mock('postgres', () => ({
  default: mocks.postgres,
}))

vi.mock('drizzle-orm/postgres-js', () => ({
  drizzle: mocks.drizzle,
}))

vi.mock('./schema', () => ({}))

const originalPostgresUrl = process.env.POSTGRES_URL
const originalDatabaseUrl = process.env.DATABASE_URL

describe('database connection selection', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.getCloudflareContext.mockReset()
    mocks.postgres.mockReset().mockImplementation((connectionString: string) => ({ connectionString }))
    mocks.drizzle.mockReset().mockImplementation((client) => ({
      select: vi.fn(() => client),
    }))
    delete process.env.POSTGRES_URL
    delete process.env.DATABASE_URL
  })

  afterEach(() => {
    if (originalPostgresUrl === undefined) {
      delete process.env.POSTGRES_URL
    } else {
      process.env.POSTGRES_URL = originalPostgresUrl
    }

    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl
    }
  })

  it('uses the Hyperdrive connection string when a Worker context is available', async () => {
    process.env.POSTGRES_URL = 'postgres://node-fallback'
    const workerContext = {
      env: {
        HYPERDRIVE: {
          connectionString: '  postgres://hyperdrive  ',
        },
      },
      ctx: {},
    }
    mocks.getCloudflareContext.mockReturnValue(workerContext)

    const { db } = await import('./index')

    expect(mocks.getCloudflareContext).not.toHaveBeenCalled()
    expect(mocks.postgres).not.toHaveBeenCalled()

    db.select()

    expect(mocks.getCloudflareContext).toHaveBeenCalledOnce()

    expect(mocks.postgres).toHaveBeenCalledWith('postgres://hyperdrive', {
      prepare: false,
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
    })
  })

  it('falls back to POSTGRES_URL outside the Worker runtime', async () => {
    process.env.POSTGRES_URL = '  postgres://local-postgres  '
    process.env.DATABASE_URL = 'postgres://local-database'
    mocks.getCloudflareContext.mockImplementation(() => {
      throw new Error('Cloudflare context unavailable')
    })

    const { db } = await import('./index')

    db.select()

    expect(mocks.postgres).toHaveBeenCalledWith(
      'postgres://local-postgres',
      expect.objectContaining({ prepare: false, max: 10 })
    )
  })

  it('falls back to DATABASE_URL when POSTGRES_URL is absent', async () => {
    process.env.DATABASE_URL = '  postgres://local-database  '
    mocks.getCloudflareContext.mockImplementation(() => {
      throw new Error('Cloudflare context unavailable')
    })

    const { db } = await import('./index')

    db.select()

    expect(mocks.postgres).toHaveBeenCalledWith(
      'postgres://local-database',
      expect.objectContaining({ prepare: false, max: 10 })
    )
  })

  it('fails closed when a Worker context has no Hyperdrive binding', async () => {
    process.env.POSTGRES_URL = 'postgres://must-not-be-used-in-worker'
    mocks.getCloudflareContext.mockReturnValue({ env: {}, ctx: {} })

    const { db } = await import('./index')

    expect(() => db.select()).toThrow(
      'Cloudflare HYPERDRIVE binding is not configured'
    )
    expect(mocks.postgres).not.toHaveBeenCalled()
  })

  it('fails closed when the Hyperdrive binding has no connection string', async () => {
    mocks.getCloudflareContext.mockReturnValue({
      env: { HYPERDRIVE: {} },
      ctx: {},
    })

    const { db } = await import('./index')

    expect(() => db.select()).toThrow(
      'Cloudflare HYPERDRIVE binding is not configured'
    )
    expect(mocks.postgres).not.toHaveBeenCalled()
  })

  it('reuses one database client per Worker request context', async () => {
    const firstContext = {
      env: { HYPERDRIVE: { connectionString: 'postgres://first-request' } },
      ctx: {},
    }
    const secondContext = {
      env: { HYPERDRIVE: { connectionString: 'postgres://second-request' } },
      ctx: {},
    }
    mocks.getCloudflareContext.mockReturnValue(firstContext)

    const { db } = await import('./index')

    db.select()
    db.select()
    expect(mocks.postgres).toHaveBeenCalledTimes(1)

    mocks.getCloudflareContext.mockReturnValue(secondContext)
    db.select()

    expect(mocks.postgres).toHaveBeenCalledTimes(2)
    expect(mocks.postgres).toHaveBeenNthCalledWith(
      2,
      'postgres://second-request',
      expect.objectContaining({ prepare: false })
    )
  })
})
