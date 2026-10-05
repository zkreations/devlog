import type { Env } from '../types.js'
import { getAllowedBranches, getAllowedRepos, getMaxEvents, getStorageKey } from '../config.js'
import { parseGitHubWebhook, verifyGitHubSignature } from '../sources/github.js'
import { addActivities } from '../storage/activities.js'

export async function handleGitHubWebhook(request: Request, env: Env): Promise<Response> {
  const event = request.headers.get('x-github-event')
  if (!event) {
    return new Response(JSON.stringify({ error: 'Missing x-github-event header' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (event === 'ping') {
    return new Response(JSON.stringify({ ok: true, message: 'pong' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (event !== 'push') {
    return new Response(JSON.stringify({ ok: true, ignored: true, event }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const secret = env?.GITHUB_WEBHOOK_SECRET
  if (!secret) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration: webhook secret not set' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const signature = request.headers.get('x-hub-signature-256')
  if (!signature) {
    return new Response(JSON.stringify({ error: 'Missing signature header' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const rawBody = await request.text()
  const isValid = await verifyGitHubSignature(secret, rawBody, signature)
  if (!isValid) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  }
  catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const allowedRepos = getAllowedRepos(env)
  const allowedBranches = getAllowedBranches(env)
  const maxEvents = getMaxEvents(env)
  const storageKey = getStorageKey(env)

  const events = parseGitHubWebhook(payload as Parameters<typeof parseGitHubWebhook>[0], allowedRepos, allowedBranches)
  if (events.length === 0) {
    return new Response(JSON.stringify({ ok: true, added: 0, message: 'No eligible commits found' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    await addActivities(env.DEVLOG_KV, events, maxEvents, storageKey)
    return new Response(JSON.stringify({ ok: true, added: events.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: 'Failed to persist activities', details: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
