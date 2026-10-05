import { describe, expect, it } from 'vitest'
import { parseGitHubWebhook, verifyGitHubSignature } from '../src/sources/github.js'

describe('source: GitHub Webhooks', () => {
  const secret = 'my-super-secret'

  async function createValidSignature(secretText: string, body: string): Promise<string> {
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

  it('should successfully validate a valid HMAC-SHA256 signature', async () => {
    const body = JSON.stringify({ hello: 'world' })
    const signature = await createValidSignature(secret, body)

    const isValid = await verifyGitHubSignature(secret, body, signature)
    expect(isValid).toBe(true)
  })

  it('should reject an invalid or tampered HMAC-SHA256 signature', async () => {
    const body = JSON.stringify({ hello: 'world' })
    const wrongSignature = 'sha256=0000000000000000000000000000000000000000000000000000000000000000'

    const isValid = await verifyGitHubSignature(secret, body, wrongSignature)
    expect(isValid).toBe(false)
  })

  it('should reject signatures with unsupported or missing format', async () => {
    const body = JSON.stringify({ hello: 'world' })
    expect(await verifyGitHubSignature(secret, body, null)).toBe(false)
    expect(await verifyGitHubSignature(secret, body, 'sha1=abcdef')).toBe(false)
  })

  it('should correctly normalize a GitHub push payload', () => {
    const payload = {
      ref: 'refs/heads/main',
      repository: {
        full_name: 'zkreations/whale',
      },
      commits: [
        {
          id: 'c0ffee1234567890',
          message: 'feat: add feed monitoring\n\nImplements RSS and Atom support',
          timestamp: '2026-10-05T15:00:00.000Z',
          url: 'https://github.com/zkreations/whale/commit/c0ffee1234567890',
          author: {
            name: 'Abel',
            username: 'zkreations',
          },
          distinct: true,
        },
      ],
    }

    const events = parseGitHubWebhook(payload)
    expect(events).toHaveLength(1)

    const event = events[0]
    expect(event.id).toBe('github:commit:c0ffee1234567890')
    expect(event.type).toBe('github.commit')
    expect(event.source).toBe('github')
    expect(event.title).toBe('feat: add feed monitoring')
    expect(event.description).toBe('feat: add feed monitoring\n\nImplements RSS and Atom support')
    expect(event.url).toBe('https://github.com/zkreations/whale/commit/c0ffee1234567890')
    expect(event.timestamp).toBe('2026-10-05T15:00:00.000Z')
    expect(event.metadata).toEqual({
      repository: 'zkreations/whale',
      branch: 'main',
      author: 'Abel',
      authorUsername: 'zkreations',
      sha: 'c0ffee1234567890',
      distinct: true,
    })
  })

  it('should handle multiple commits in the same push', () => {
    const payload = {
      ref: 'refs/heads/main',
      repository: { full_name: 'user/repo' },
      commits: [
        { id: 'sha-1', message: 'fix: first bug', timestamp: '2026-10-05T10:00:00Z', author: { name: 'User' } },
        { id: 'sha-2', message: 'docs: update readme', timestamp: '2026-10-05T11:00:00Z', author: { name: 'User' } },
      ],
    }

    const events = parseGitHubWebhook(payload)
    expect(events).toHaveLength(2)
    expect(events[0].id).toBe('github:commit:sha-1')
    expect(events[1].id).toBe('github:commit:sha-2')
  })

  it('should filter commits by allowed repository when configured', () => {
    const payload = {
      ref: 'refs/heads/main',
      repository: { full_name: 'other/repo' },
      commits: [{ id: 'sha-1', message: 'commit' }],
    }

    const events = parseGitHubWebhook(payload, ['allowed/repo'], [])
    expect(events).toEqual([])
  })

  it('should filter commits by allowed branch when configured', () => {
    const payload = {
      ref: 'refs/heads/develop',
      repository: { full_name: 'user/repo' },
      commits: [{ id: 'sha-1', message: 'commit' }],
    }

    const events = parseGitHubWebhook(payload, [], ['main'])
    expect(events).toEqual([])
  })

  it('should handle missing optional fields without failing', () => {
    const payload = {
      repository: {},
      commits: [
        { id: 'sha-minimal' },
      ],
    }

    const events = parseGitHubWebhook(payload)
    expect(events).toHaveLength(1)
    expect(events[0].title).toBe('Commit without message')
    expect(events[0].metadata.author).toBe('Unknown')
  })
})
