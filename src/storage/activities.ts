import type { ActivityEvent } from '../types.js'
import { DEFAULT_MAX_EVENTS, DEFAULT_STORAGE_KEY } from '../config.js'

export async function getActivities<T = any>(
  kv: KVNamespace | null | undefined,
  storageKey = DEFAULT_STORAGE_KEY,
): Promise<ActivityEvent<T>[]> {
  if (!kv) {
    throw new Error('KV binding is not available')
  }

  try {
    const raw = await kv.get(storageKey)
    if (!raw) {
      return []
    }

    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(parsed) ? parsed : []
  }
  catch {
    return []
  }
}

export async function saveActivities<T = any>(
  kv: KVNamespace | null | undefined,
  activities: ActivityEvent<T>[],
  storageKey = DEFAULT_STORAGE_KEY,
): Promise<void> {
  if (!kv) {
    throw new Error('KV binding is not available')
  }

  const payload = JSON.stringify(activities)
  await kv.put(storageKey, payload)
}

export async function addActivities<T = any>(
  kv: KVNamespace | null | undefined,
  newEvents: ActivityEvent<T>[],
  maxEvents = DEFAULT_MAX_EVENTS,
  storageKey = DEFAULT_STORAGE_KEY,
): Promise<ActivityEvent<T>[]> {
  if (!Array.isArray(newEvents) || newEvents.length === 0) {
    return await getActivities<T>(kv, storageKey)
  }

  const current = await getActivities<T>(kv, storageKey)
  const existingIds = new Set(current.map(item => item.id))

  const validNewEvents = newEvents.filter((event) => {
    return event && typeof event === 'object' && event.id && !existingIds.has(event.id)
  })

  if (validNewEvents.length === 0) {
    return current
  }

  const merged = [...validNewEvents, ...current]

  merged.sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime() || 0
    const timeB = new Date(b.timestamp).getTime() || 0
    return timeB - timeA
  })

  const capped = merged.slice(0, maxEvents)

  await saveActivities(kv, capped, storageKey)
  return capped
}
