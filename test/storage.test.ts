import type { ActivityEvent } from '../src/types.js'
import { describe, expect, it } from 'vitest'
import { addActivities, getActivities } from '../src/storage/activities.js'
import { MockKV } from './mocks/kv.mock.js'

describe('storage: KV Activities', () => {
  it('should handle empty KV by returning an empty list', async () => {
    const kv = new MockKV() as unknown as KVNamespace
    const activities = await getActivities(kv)
    expect(activities).toEqual([])
  })

  it('should recover from corrupt JSON data in KV by returning empty list', async () => {
    const kv = new MockKV({ recent_activities: '{ malformed json' }) as unknown as KVNamespace
    const activities = await getActivities(kv)
    expect(activities).toEqual([])
  })

  it('should add the first event correctly', async () => {
    const kv = new MockKV() as unknown as KVNamespace
    const event: ActivityEvent = {
      id: 'event-1',
      type: 'github.commit',
      source: 'github',
      title: 'Initial commit',
      description: 'First commit',
      url: 'https://example.com/1',
      timestamp: '2026-10-01T10:00:00.000Z',
      metadata: {},
    }

    const result = await addActivities(kv, [event])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('event-1')

    const persisted = await getActivities(kv)
    expect(persisted).toHaveLength(1)
    expect(persisted[0].id).toBe('event-1')
  })

  it('should add multiple events and maintain order from newest to oldest', async () => {
    const kv = new MockKV() as unknown as KVNamespace
    const events: ActivityEvent[] = [
      { id: 'e-older', timestamp: '2026-10-01T10:00:00.000Z', title: 'Older', type: 't', source: 's', description: '', url: '', metadata: {} },
      { id: 'e-newer', timestamp: '2026-10-05T12:00:00.000Z', title: 'Newer', type: 't', source: 's', description: '', url: '', metadata: {} },
      { id: 'e-middle', timestamp: '2026-10-03T08:00:00.000Z', title: 'Middle', type: 't', source: 's', description: '', url: '', metadata: {} },
    ]

    const result = await addActivities(kv, events)
    expect(result).toHaveLength(3)
    expect(result[0].id).toBe('e-newer')
    expect(result[1].id).toBe('e-middle')
    expect(result[2].id).toBe('e-older')
  })

  it('should detect and not duplicate events with the same id', async () => {
    const kv = new MockKV() as unknown as KVNamespace
    const event: ActivityEvent = { id: 'dup-1', timestamp: '2026-10-01T10:00:00.000Z', title: 'Unique', type: 't', source: 's', description: '', url: '', metadata: {} }

    await addActivities(kv, [event])
    const secondResult = await addActivities(kv, [event])

    expect(secondResult).toHaveLength(1)
    expect(secondResult[0].id).toBe('dup-1')
  })

  it('should keep exactly 50 events and evict the oldest when adding event 51', async () => {
    const kv = new MockKV() as unknown as KVNamespace

    const baseTime = new Date('2026-01-01T00:00:00.000Z').getTime()
    const initial50: ActivityEvent[] = []
    for (let i = 1; i <= 50; i++) {
      initial50.push({
        id: `event-${i}`,
        type: 'test.event',
        source: 'test',
        title: `Event ${i}`,
        description: '',
        url: '',
        timestamp: new Date(baseTime + i * 1000).toISOString(),
        metadata: {},
      })
    }

    const firstBatch = await addActivities(kv, initial50, 50)
    expect(firstBatch).toHaveLength(50)
    expect(firstBatch[0].id).toBe('event-50')
    expect(firstBatch[49].id).toBe('event-1')

    const event51: ActivityEvent = {
      id: 'event-51',
      type: 'test.event',
      source: 'test',
      title: 'Event 51 (Newest)',
      description: '',
      url: '',
      timestamp: new Date(baseTime + 51 * 1000).toISOString(),
      metadata: {},
    }

    const updated = await addActivities(kv, [event51], 50)

    expect(updated).toHaveLength(50)
    expect(updated[0].id).toBe('event-51')

    const containsOldest = updated.some(e => e.id === 'event-1')
    expect(containsOldest).toBe(false)
    expect(updated[49].id).toBe('event-2')

    const fromStorage = await getActivities(kv)
    expect(fromStorage).toHaveLength(50)
    expect(fromStorage[0].id).toBe('event-51')
    expect(fromStorage[49].id).toBe('event-2')
  })
})
