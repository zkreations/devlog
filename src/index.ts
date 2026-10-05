import type { Env } from './types.js'
import { getConfiguredFeeds, getCorsHeaders, getMaxEvents, getStorageKey } from './config.js'
import { handleGetActivity } from './routes/activity.js'
import { handleSyncFeeds } from './routes/sync.js'
import { handleGitHubWebhook } from './routes/webhooks.js'
import { fetchAllFeeds } from './sources/feed.js'
import { addActivities } from './storage/activities.js'

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url)
      const { pathname } = url
      const { method } = request

      if (method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: getCorsHeaders(env, 'GET, POST, OPTIONS'),
        })
      }

      if (pathname === '/activity') {
        if (method === 'GET') {
          return await handleGetActivity(request, env)
        }
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
          status: 405,
          headers: {
            'Content-Type': 'application/json',
            ...getCorsHeaders(env, 'GET, OPTIONS'),
          },
        })
      }

      if (pathname === '/webhooks/github') {
        if (method === 'POST') {
          return await handleGitHubWebhook(request, env)
        }
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      if (pathname === '/sync/feeds') {
        if (method === 'POST') {
          return await handleSyncFeeds(request, env)
        }
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      return new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(env),
        },
      })
    }
    catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return new Response(JSON.stringify({ error: 'Internal Server Error', details: message }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...getCorsHeaders(env),
        },
      })
    }
  },

  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const feeds = getConfiguredFeeds(env)
    if (!feeds || feeds.length === 0) {
      return
    }

    try {
      const entries = await fetchAllFeeds(feeds, env)
      if (entries.length > 0) {
        const maxEvents = getMaxEvents(env)
        const storageKey = getStorageKey(env)
        await addActivities(env.DEVLOG_KV, entries, maxEvents, storageKey)
      }
    }
    catch (err) {
      console.error('[scheduled:feed-sync] Sync failed:', err)
    }
  },
}
