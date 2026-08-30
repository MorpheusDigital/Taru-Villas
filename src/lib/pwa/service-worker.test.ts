import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

type WorkerHandler = (event: {
  request?: { method: string; url: string }
  respondWith?: (response: Promise<Response>) => void
  waitUntil?: (promise: Promise<unknown>) => void
}) => void

function loadWorker({
  cacheNames = [],
  openCache,
}: {
  cacheNames?: string[]
  openCache: () => Promise<{
    match: (request: unknown) => Promise<Response | undefined>
    put: (request: unknown, response: Response) => Promise<void>
  }>
}) {
  const handlers = new Map<string, WorkerHandler>()
  const deletedCaches: string[] = []
  const clients = { claim: async () => undefined }

  const self = {
    addEventListener(type: string, handler: WorkerHandler) {
      handlers.set(type, handler)
    },
    clients,
    location: { origin: 'https://portal.taruvillas.com' },
    registration: { showNotification: async () => undefined },
    skipWaiting() {},
  }

  runInNewContext(
    readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8'),
    {
      URL,
      caches: {
        delete: async (name: string) => {
          deletedCaches.push(name)
          return true
        },
        keys: async () => cacheNames,
        open: openCache,
      },
      fetch: async () => new Response('network'),
      self,
    },
  )

  return { deletedCaches, handlers }
}

describe('service worker cache boundary', () => {
  it('does not intercept API or navigation requests', () => {
    const worker = loadWorker({
      openCache: async () => ({
        match: async () => undefined,
        put: async () => undefined,
      }),
    })
    let intercepted = false

    worker.handlers.get('fetch')?.({
      request: { method: 'GET', url: 'https://portal.taruvillas.com/api/tasks' },
      respondWith: () => {
        intercepted = true
      },
    })

    expect(intercepted).toBe(false)
  })

  it('returns an online response when cache storage fails', async () => {
    const worker = loadWorker({
      openCache: async () => {
        throw new Error('quota exceeded')
      },
    })
    let responsePromise: Promise<Response> | undefined

    worker.handlers.get('fetch')?.({
      request: {
        method: 'GET',
        url: 'https://portal.taruvillas.com/_next/static/chunks/app.js',
      },
      respondWith: (response) => {
        responsePromise = response
      },
    })

    expect(await responsePromise).toHaveProperty('status', 200)
  })

  it('only clears its own prior static cache versions', async () => {
    const worker = loadWorker({
      cacheNames: ['other-feature-v1', 'taru-static-v0', 'taru-static-v1'],
      openCache: async () => ({
        match: async () => undefined,
        put: async () => undefined,
      }),
    })
    let activation: Promise<unknown> | undefined

    worker.handlers.get('activate')?.({
      waitUntil: (promise) => {
        activation = promise
      },
    })

    await activation
    expect(worker.deletedCaches).toEqual(['taru-static-v0'])
  })
})
