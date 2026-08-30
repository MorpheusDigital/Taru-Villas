import { getCloudflareContext } from '@opennextjs/cloudflare'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

function createDatabase(connectionString: string) {
  const client = postgres(connectionString, {
    prepare: false,
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  })

  return drizzle(client, { schema })
}

type Database = ReturnType<typeof createDatabase>

const workerDatabases = new WeakMap<object, Database>()
let nodeDatabase: Database | undefined

function readHyperdriveConnectionString(env: CloudflareEnv): string | null {
  if (!('HYPERDRIVE' in env)) return null

  const hyperdrive = env.HYPERDRIVE
  if (
    typeof hyperdrive !== 'object' ||
    hyperdrive === null ||
    !('connectionString' in hyperdrive) ||
    typeof hyperdrive.connectionString !== 'string'
  ) {
    return null
  }

  return hyperdrive.connectionString.trim() || null
}

function getWorkerDatabase(): Database | null {
  let context

  try {
    context = getCloudflareContext()
  } catch {
    return null
  }

  const connectionString = readHyperdriveConnectionString(context.env)
  if (!connectionString) {
    throw new Error('Cloudflare HYPERDRIVE binding is not configured')
  }

  const existingDatabase = workerDatabases.get(context.ctx)
  if (existingDatabase) return existingDatabase

  const database = createDatabase(connectionString)
  workerDatabases.set(context.ctx, database)
  return database
}

function getNodeDatabase(): Database {
  if (nodeDatabase) return nodeDatabase

  // Prefer POSTGRES_URL (transaction mode, port 6543) for serverless compatibility.
  // Session mode (port 5432) exhausts pool_size with concurrent serverless instances.
  const connectionString = (
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    ''
  ).trim()

  nodeDatabase = createDatabase(connectionString)
  return nodeDatabase
}

function getDatabase(): Database {
  return getWorkerDatabase() ?? getNodeDatabase()
}

export const db = new Proxy({} as Database, {
  get(_target, property) {
    const database = getDatabase()
    const value = Reflect.get(database, property, database)
    return typeof value === 'function' ? value.bind(database) : value
  },
})
