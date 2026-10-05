import type { Env, FeedConfig } from './types.js'

export const DEFAULT_MAX_EVENTS = 50
export const DEFAULT_STORAGE_KEY = 'recent_activities'

export function getMaxEvents(env?: Partial<Env>): number {
  if (env?.MAX_EVENTS) {
    const parsed = parseInt(env.MAX_EVENTS, 10)
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed
    }
  }
  return DEFAULT_MAX_EVENTS
}

export function getStorageKey(env?: Partial<Env>): string {
  return env?.ACTIVITIES_STORAGE_KEY || DEFAULT_STORAGE_KEY
}

export function getAllowedRepos(env?: Partial<Env>): string[] {
  if (!env?.ALLOWED_REPOS) {
    return []
  }
  return env.ALLOWED_REPOS
    .split(',')
    .map(r => r.trim().toLowerCase())
    .filter(Boolean)
}

export function getAllowedBranches(env?: Partial<Env>): string[] {
  if (!env?.ALLOWED_BRANCHES) {
    return []
  }
  return env.ALLOWED_BRANCHES
    .split(',')
    .map(b => b.trim())
    .filter(Boolean)
}

export function getCorsHeaders(env?: Partial<Env>, methods = 'GET, OPTIONS'): Record<string, string> {
  const origin = env?.CORS_ORIGIN || '*'
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
}

export function getConfiguredFeeds(env?: Partial<Env>): FeedConfig[] {
  if (!env?.FEED_URLS && !env?.FEEDS_CONFIG) {
    return []
  }

  const raw = env.FEEDS_CONFIG || env.FEED_URLS
  if (!raw || typeof raw !== 'string') {
    return []
  }

  const trimmed = raw.trim()
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed.map((item, idx): FeedConfig => {
          if (typeof item === 'string') {
            return { id: `feed_${idx}`, url: item, name: item, source: 'blog' }
          }
          return {
            id: item.id || `feed_${idx}`,
            url: item.url,
            name: item.name || item.url,
            source: item.source || 'blog',
          }
        }).filter(f => Boolean(f.url))
      }
    }
    catch {
    }
  }

  return trimmed
    .split(',')
    .map(url => url.trim())
    .filter(Boolean)
    .map((url, idx): FeedConfig => ({
      id: `feed_${idx}`,
      url,
      name: url,
      source: 'blog',
    }))
}
