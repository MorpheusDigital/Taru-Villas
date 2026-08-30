/**
 * Structural binding type used by the Next.js typecheck. `wrangler types`
 * generates full Workers runtime globals, whose Fetch JSON types conflict with
 * the existing browser/Next.js application typings.
 */
interface CloudflareEnv {
  HYPERDRIVE?: {
    connectionString: string
  }
}
