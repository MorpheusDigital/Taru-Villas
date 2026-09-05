import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs, parseEnv } from 'node:util'
import { createRequire } from 'node:module'

// Vite is Vitest's dependency and may be nested rather than hoisted by npm.
const requireFromVitest = createRequire(import.meta.resolve('vitest/package.json'))
const { createServer } = await import(requireFromVitest.resolve('vite'))

// Default is a transactional dry run. Never embed CSV data or credentials in git.
const { values } = parseArgs({ options: {
  file: { type: 'string' }, 'env-file': { type: 'string' }, 'org-id': { type: 'string' }, apply: { type: 'boolean', default: false },
} })
if (!values.file || !values['env-file'] || !values['org-id']) {
  throw new Error('Usage: node scripts/seed-vehicle-sheet.mjs --file <CSV> --env-file <local-env> --org-id <UUID> [--apply]')
}
const env = parseEnv(fs.readFileSync(values['env-file'], 'utf8'))
for (const key of ['POSTGRES_URL', 'DATABASE_URL']) if (env[key]) process.env[key] = env[key]
if (!process.env.POSTGRES_URL && !process.env.DATABASE_URL) throw new Error('Database connection missing')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// Reuse the application's TypeScript validation and transaction code without
// adding a second importer implementation or a new runtime dependency.
const server = await createServer({ root, configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
let exitCode = 0
try {
  const { parseVehicleSheet } = await server.ssrLoadModule('/src/lib/fleet/vehicle-import.ts')
  const { importVehiclesInTransaction } = await server.ssrLoadModule('/src/lib/db/queries/vehicle-import.ts')
  const { db } = await server.ssrLoadModule('/src/lib/db/index.ts')
  const imported = parseVehicleSheet(fs.readFileSync(values.file, 'utf8'), path.basename(values.file))
  const rollback = new Error('dry-run-rollback')
  let results
  try {
    await db.transaction(async tx => {
      results = await importVehiclesInTransaction(tx, values['org-id'], imported)
      if (!values.apply) throw rollback
    })
  } catch (error) { if (error !== rollback) throw error }
  console.log(JSON.stringify({ mode: values.apply ? 'applied' : 'dry-run (rolled back)', count: results.length, results }, null, 2))
} catch (error) {
  // Database errors may contain credentials or imported personal details in
  // query parameters. Only surface safe domain failures and error type.
  console.error(error instanceof Error && /^(Changed source|Ambiguous|Conflicting|Duplicate|CSV|Multiple sheet|Import organization)/.test(error.message)
    ? error.message : `Import failed (${error?.name ?? 'unknown error'}); transaction rolled back. Details withheld.`)
  exitCode = 1
} finally {
  await server.close()
}
process.exit(exitCode)
