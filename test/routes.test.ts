import type { Env } from '../src/types.js'
import { describe, expect, it } from 'vitest'
import worker from '../src/index.js'
import { MockKV } from './mocks/kv.mock.js'

describe('hTTP Routing and API Endpoints', () => {
  const secret = 'webhook-secret-123'
  const mockCtx = {} as ExecutionContext

  async function generateSignature(secretText: string, body: string): Promise<string> {
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secretText),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
    const hex = Array.from(new Uint8Array(sigBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    return `sha256=${hex}`
  }

  it('gET /activity should return empty list and CORS headers when KV is empty', async () => {
    const kv = new MockKV() as unknown as KVNamespace
    const env: Env = { DEVLOG_KV: kv }
    const request = new Request('https://activity.dev/activity')

    const response = await worker.fetch(request, env, mockCtx)
    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')

    const data = await response.json() as any
    expect(data).toEqual({ activities: [], count: 0 })
  })

  it('gET /activity should respect limit parameter and cap it to configured max', async () => {
    const kv = new MockKV() as unknown as KVNamespace
    const activities = [
      { id: '1', timestamp: '2026-10-05T12:00:00Z', title: 'One' },
      { id: '2', timestamp: '2026-10-04T12:00:00Z', title: 'Two' },
      { id: '3', timestamp: '2026-10-03T12:00:00Z', title: 'Three' },
    ]
    await kv.put('recent_activities', JSON.stringify(activities))

    const env: Env = { DEVLOG_KV: kv, MAX_EVENTS: '2' }
    const req1 = new Request('https://activity.dev/activity?limit=1')
    const res1 = await worker.fetch(req1, env, mockCtx)
    const data1 = await res1.json() as any
    expect(data1.activities).toHaveLength(1)
    expect(data1.activities[0].id).toBe('1')

    const req2 = new Request('https://activity.dev/activity?limit=10')
    const res2 = await worker.fetch(req2, env, mockCtx)
    const data2 = await res2.json() as any
    expect(data2.activities).toHaveLength(2)
  })

  it('gET /activity should return 400 if limit is not a valid positive integer', async () => {
    const kv = new MockKV() as unknown as KVNamespace
    const env: Env = { DEVLOG_KV: kv }
    const request = new Request('https://activity.dev/activity?limit=invalid')

    const response = await worker.fetch(request, env, mockCtx)
    expect(response.status).toBe(400)
    const data = await response.json() as any
    expect(data.error).toContain('Invalid limit')
  })

  it('oPTIONS /activity should respond 204 with preflight CORS headers', async () => {
    const request = new Request('https://activity.dev/activity', { method: 'OPTIONS' })
    const response = await worker.fetch(request, {} as Env, mockCtx)

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET')
  })

  it('pOST /webhooks/github should respond 200 to ping without requiring signature', async () => {
    const kv = new MockKV() as unknown as KVNamespace
    const env: Env = { DEVLOG_KV: kv, GITHUB_WEBHOOK_SECRET: secret }
    const request = new Request('https://activity.dev/webhooks/github', {
      method: 'POST',
      headers: {
        'x-github-event': 'ping',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ zen: 'Keep it logically awesome.' }),
    })

    const response = await worker.fetch(request, env, mockCtx)
    expect(response.status).toBe(200)
    const data = await response.json() as any
    expect(data.message).toBe('pong')
  })

  it('pOST /webhooks/github should reject with 401 if signature is invalid or missing', async () => {
    const kv = new MockKV() as unknown as KVNamespace
    const env: Env = { DEVLOG_KV: kv, GITHUB_WEBHOOK_SECRET: secret }

    const requestNoSig = new Request('https://activity.dev/webhooks/github', {
      method: 'POST',
      headers: {
        'x-github-event': 'push',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ commits: [] }),
    })
    const resNoSig = await worker.fetch(requestNoSig, env, mockCtx)
    expect(resNoSig.status).toBe(401)

    const requestBadSig = new Request('https://activity.dev/webhooks/github', {
      method: 'POST',
      headers: {
        'x-github-event': 'push',
        'x-hub-signature-256': 'sha256=1111111111111111111111111111111111111111111111111111111111111111',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ commits: [] }),
    })
    const resBadSig = await worker.fetch(requestBadSig, env, mockCtx)
    expect(resBadSig.status).toBe(401)
  })

  it('pOST /webhooks/github should process a valid push and store events in KV', async () => {
    const kv = new MockKV() as unknown as KVNamespace
    const env: Env = { DEVLOG_KV: kv, GITHUB_WEBHOOK_SECRET: secret }

    const payload = JSON.stringify({
      ref: 'refs/heads/main',
      repository: { full_name: 'zkreations/whale' },
      commits: [
        {
          id: 'commit-sha-abc',
          message: 'feat: add feed integration',
          timestamp: '2026-10-05T15:00:00Z',
          author: { name: 'Abel' },
        },
      ],
    })

    const signature = await generateSignature(secret, payload)
    const request = new Request('https://activity.dev/webhooks/github', {
      method: 'POST',
      headers: {
        'x-github-event': 'push',
        'x-hub-signature-256': signature,
        'Content-Type': 'application/json',
      },
      body: payload,
    })

    const response = await worker.fetch(request, env, mockCtx)
    expect(response.status).toBe(200)
    const data = await response.json() as any
    expect(data.ok).toBe(true)
    expect(data.added).toBe(1)

    const rawStored = await kv.get('recent_activities')
    expect(rawStored).not.toBeNull()
    const stored = JSON.parse(rawStored!)
    expect(stored).toHaveLength(1)
    expect(stored[0].id).toBe('github:commit:commit-sha-abc')
    expect(stored[0].title).toBe('feat: add feed integration')
  })

  it('pOST /sync/feeds should require authentication when SYNC_SECRET is configured', async () => {
    const kv = new MockKV() as unknown as KVNamespace
    const env: Env = { DEVLOG_KV: kv, SYNC_SECRET: 'auth-token-xyz' }

    const unauthReq = new Request('https://activity.dev/sync/feeds', { method: 'POST' })
    const unauthRes = await worker.fetch(unauthReq, env, mockCtx)
    expect(unauthRes.status).toBe(401)

    const authReq = new Request('https://activity.dev/sync/feeds', {
      method: 'POST',
      headers: { Authorization: 'Bearer auth-token-xyz' },
    })
    const authRes = await worker.fetch(authReq, env, mockCtx)
    expect(authRes.status).toBe(200)
  })

  it('should respond 404 to nonexistent routes', async () => {
    const request = new Request('https://activity.dev/unknown-route')
    const response = await worker.fetch(request, {} as Env, mockCtx)
    expect(response.status).toBe(404)
    const data = await response.json() as any
    expect(data.error).toBe('Not Found')
  })
})
