import type { Env } from '../types.js'
import { getConfiguredFeeds, getMaxEvents, getStorageKey } from '../config.js'
import { fetchAllFeeds } from '../sources/feed.js'
import { addActivities } from '../storage/activities.js'

export async function handleSyncFeeds(request: Request, env: Env): Promise<Response> {
  const syncSecret = env?.SYNC_SECRET

  if (syncSecret) {
    const authHeader = request.headers.get('Authorization')
    const customHeader = request.headers.get('x-sync-secret')

    let providedToken = customHeader
    if (!providedToken && authHeader?.startsWith('Bearer ')) {
      providedToken = authHeader.slice(7).trim()
    }

    if (!providedToken || providedToken !== syncSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  const feeds = getConfiguredFeeds(env)
  if (feeds.length === 0) {
    return new Response(JSON.stringify({ ok: true, processedFeeds: 0, newActivities: 0, message: 'No feeds configured' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const feedEntries = await fetchAllFeeds(feeds, env)
    const maxEvents = getMaxEvents(env)
    const storageKey = getStorageKey(env)

    const updated = await addActivities(env.DEVLOG_KV, feedEntries, maxEvents, storageKey)

    return new Response(JSON.stringify({
      ok: true,
      processedFeeds: feeds.length,
      foundEntries: feedEntries.length,
      totalStored: updated.length,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: 'Feed sync failed', details: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
