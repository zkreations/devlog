import type { Env } from '../types.js'
import { getCorsHeaders, getMaxEvents, getStorageKey } from '../config.js'
import { getActivities } from '../storage/activities.js'

export async function handleGetActivity(request: Request, env: Env): Promise<Response> {
  const corsHeaders = getCorsHeaders(env, 'GET, OPTIONS')
  const maxConfigured = getMaxEvents(env)
  const storageKey = getStorageKey(env)

  const url = new URL(request.url)
  const limitParam = url.searchParams.get('limit')

  let limit = maxConfigured
  if (limitParam !== null) {
    const parsed = parseInt(limitParam, 10)
    if (Number.isNaN(parsed) || parsed < 1) {
      return new Response(
        JSON.stringify({ error: 'Invalid limit parameter. Must be a positive integer.' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        },
      )
    }
    limit = Math.min(parsed, maxConfigured)
  }

  try {
    const allActivities = await getActivities(env.DEVLOG_KV, storageKey)
    const activities = allActivities.slice(0, limit)

    return new Response(
      JSON.stringify({
        activities,
        count: activities.length,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      },
    )
  }
  catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(
      JSON.stringify({ error: 'Failed to retrieve activities', details: message }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      },
    )
  }
}

export function handleOptionsActivity(_request: Request, env: Env): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(env, 'GET, OPTIONS'),
  })
}
