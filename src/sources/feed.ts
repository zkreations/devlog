import type { ActivityEvent, Env, FeedConfig, FeedPostMetadata } from '../types.js'
import { decodeXmlEntities, getAttrValue, getTagValue } from '../utils/xml.js'

const FEED_HEADERS = {
  'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html, application/json, */*',
  'User-Agent': 'DevlogActivityWorker/1.0',
}

function parseIsoTimestamp(rawDate: string | null | undefined): string {
  if (!rawDate) {
    return new Date().toISOString()
  }
  const parsed = new Date(rawDate)
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
}

export function parseFeedEntries(
  content: unknown,
  feedMeta: Partial<FeedConfig> = {},
): ActivityEvent<FeedPostMetadata>[] {
  if (!content) {
    return []
  }

  const slug = (feedMeta.name || feedMeta.id || 'source')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'feed'

  if (typeof content === 'object') {
    return parseJsonFeedEntries(content, slug, feedMeta)
  }

  if (typeof content !== 'string') {
    return []
  }

  const raw = content.trim()
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      const json = JSON.parse(raw)
      return parseJsonFeedEntries(json, slug, feedMeta)
    }
    catch {
    }
  }

  const entries: ActivityEvent<FeedPostMetadata>[] = []

  const atomEntryRegex = /<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi
  for (const atomMatch of raw.matchAll(atomEntryRegex)) {
    const entryXml = atomMatch[1]
    const rawId = getTagValue(entryXml, 'id')
    const title = getTagValue(entryXml, 'title') || 'Untitled post'

    let link = ''
    const linkTags = entryXml.match(/<link\s[^>]*>/gi) || []
    for (const tag of linkTags) {
      const rel = getAttrValue(tag, 'rel')
      const href = getAttrValue(tag, 'href')
      if (href) {
        if (!rel || rel === 'alternate') {
          link = href
          break
        }
        if (!link) {
          link = href
        }
      }
    }
    if (!link) {
      link = getTagValue(entryXml, 'link') || ''
    }

    const rawDate = getTagValue(entryXml, 'published') || getTagValue(entryXml, 'updated')
    const timestamp = parseIsoTimestamp(rawDate)
    const summary = getTagValue(entryXml, 'summary') || getTagValue(entryXml, 'content') || ''
    const author = getTagValue(entryXml, 'name') || null

    const uniqueKey = rawId || link || title
    entries.push({
      id: `feed:${slug}:${uniqueKey}`,
      type: 'feed.post',
      source: feedMeta.source || 'blog',
      title,
      description: summary.replace(/<[^>]+>/g, '').trim(),
      url: link,
      timestamp,
      metadata: {
        feedUrl: feedMeta.url || '',
        feedTitle: feedMeta.name || '',
        author,
      },
    })
  }

  if (entries.length > 0) {
    return entries
  }

  const rssItemRegex = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi
  for (const rssMatch of raw.matchAll(rssItemRegex)) {
    const itemXml = rssMatch[1]
    const guid = getTagValue(itemXml, 'guid')
    const title = getTagValue(itemXml, 'title') || 'Untitled post'
    const link = getTagValue(itemXml, 'link') || ''
    const rawDate = getTagValue(itemXml, 'pubDate') || getTagValue(itemXml, 'dc:date')
    const timestamp = parseIsoTimestamp(rawDate)
    const description = getTagValue(itemXml, 'description') || getTagValue(itemXml, 'content:encoded') || ''
    const author = getTagValue(itemXml, 'dc:creator') || getTagValue(itemXml, 'author') || null

    const uniqueKey = guid || link || title
    entries.push({
      id: `feed:${slug}:${uniqueKey}`,
      type: 'feed.post',
      source: feedMeta.source || 'blog',
      title,
      description: description.replace(/<[^>]+>/g, '').trim(),
      url: link,
      timestamp,
      metadata: {
        feedUrl: feedMeta.url || '',
        feedTitle: feedMeta.name || '',
        author,
      },
    })
  }

  return entries
}

interface JsonFeedItem {
  id?: string
  url?: string
  title?: string
  summary?: string
  content_text?: string
  date_published?: string
  date_modified?: string
  author?: string | { name?: string }
}

interface BloggerEntry {
  id?: { $t?: string }
  title?: { $t?: string }
  published?: { $t?: string }
  updated?: { $t?: string }
  summary?: { $t?: string }
  content?: { $t?: string }
  link?: Array<{ rel?: string, href?: string }>
  author?: Array<{ name?: { $t?: string } }>
}

interface WordPressPost {
  id?: number | string
  date?: string
  date_gmt?: string
  link?: string
  title?: { rendered?: string }
  excerpt?: { rendered?: string }
}

function parseJsonFeedEntries(
  data: unknown,
  slug: string,
  feedMeta: Partial<FeedConfig>,
): ActivityEvent<FeedPostMetadata>[] {
  const entries: ActivityEvent<FeedPostMetadata>[] = []
  const obj = data as Record<string, unknown>

  if (Array.isArray(obj?.items)) {
    for (const item of obj.items as JsonFeedItem[]) {
      const rawDate = item.date_published || item.date_modified
      const author = typeof item.author === 'object' ? item.author?.name || null : item.author || null
      const uniqueKey = item.id || item.url || item.title || 'untitled'
      entries.push({
        id: `feed:${slug}:${uniqueKey}`,
        type: 'feed.post',
        source: feedMeta.source || 'blog',
        title: item.title || 'Untitled post',
        description: (item.summary || item.content_text || '').trim(),
        url: item.url || '',
        timestamp: parseIsoTimestamp(rawDate),
        metadata: {
          feedUrl: feedMeta.url || '',
          feedTitle: feedMeta.name || '',
          author,
        },
      })
    }
    return entries
  }

  const feedObj = obj?.feed as { entry?: BloggerEntry[] } | undefined
  if (Array.isArray(feedObj?.entry)) {
    for (const entry of feedObj.entry) {
      const rawId = entry.id?.$t || ''
      const title = entry.title?.$t || 'Untitled post'
      const alternateLink = entry.link?.find(l => l.rel === 'alternate')?.href || entry.link?.[0]?.href || ''
      const rawDate = entry.published?.$t || entry.updated?.$t
      const summary = entry.summary?.$t || entry.content?.$t || ''
      const author = entry.author?.[0]?.name?.$t || null

      const uniqueKey = rawId || alternateLink || title
      entries.push({
        id: `feed:${slug}:${uniqueKey}`,
        type: 'feed.post',
        source: feedMeta.source || 'blog',
        title,
        description: summary.replace(/<[^>]+>/g, '').trim(),
        url: alternateLink,
        timestamp: parseIsoTimestamp(rawDate),
        metadata: {
          feedUrl: feedMeta.url || '',
          feedTitle: feedMeta.name || '',
          author,
        },
      })
    }
    return entries
  }

  if (Array.isArray(data) && data[0]?.id && (data[0] as WordPressPost)?.title?.rendered !== undefined) {
    for (const post of data as WordPressPost[]) {
      const title = post.title?.rendered ? decodeXmlEntities(post.title.rendered) : 'Untitled post'
      const rawDate = post.date_gmt ? `${post.date_gmt}Z` : post.date
      const excerpt = post.excerpt?.rendered ? decodeXmlEntities(post.excerpt.rendered).replace(/<[^>]+>/g, '').trim() : ''

      entries.push({
        id: `feed:${slug}:${post.id}`,
        type: 'feed.post',
        source: feedMeta.source || 'blog',
        title,
        description: excerpt,
        url: post.link || '',
        timestamp: parseIsoTimestamp(rawDate),
        metadata: {
          feedUrl: feedMeta.url || '',
          feedTitle: feedMeta.name || '',
          author: null,
        },
      })
    }
    return entries
  }

  return entries
}

export async function fetchAndParseFeed(
  feedMeta: FeedConfig,
  timeoutMs = 8000,
): Promise<ActivityEvent<FeedPostMetadata>[]> {
  if (!feedMeta?.url) {
    return []
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(feedMeta.url, {
      headers: FEED_HEADERS,
      signal: controller.signal,
    })

    if (!res.ok) {
      return []
    }

    const body = await res.text()
    return parseFeedEntries(body, feedMeta)
  }
  catch {
    return []
  }
  finally {
    clearTimeout(timeoutId)
  }
}

export async function fetchAllFeeds(
  feedList: FeedConfig[] = [],
  _env?: Partial<Env>,
): Promise<ActivityEvent<FeedPostMetadata>[]> {
  if (!Array.isArray(feedList) || feedList.length === 0) {
    return []
  }

  const results = await Promise.allSettled(
    feedList.map(feed => fetchAndParseFeed(feed)),
  )

  const allEntries: ActivityEvent<FeedPostMetadata>[] = []
  for (const result of results) {
    if (result.status === 'fulfilled' && Array.isArray(result.value)) {
      allEntries.push(...result.value)
    }
  }

  return allEntries
}
