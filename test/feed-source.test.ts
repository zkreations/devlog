import { describe, expect, it } from 'vitest'
import { parseFeedEntries } from '../src/sources/feed.js'
import { decodeXmlEntities } from '../src/utils/xml.js'

describe('source: Universal Feeds', () => {
  it('should decode XML entities, CDATA, and special characters', () => {
    const raw = '<![CDATA[Text &amp; news &#8212; &quot;Great&quot;]]>'
    const decoded = decodeXmlEntities(raw)
    expect(decoded).toBe('Text & news — "Great"')
  })

  it('should parse RSS 2.0 feeds correctly', () => {
    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>My Blog</title>
        <link>https://example.com</link>
        <item>
          <title><![CDATA[New Post & Update]]></title>
          <link>https://example.com/post-1</link>
          <guid>post-1-guid</guid>
          <pubDate>Mon, 05 Oct 2026 14:00:00 GMT</pubDate>
          <description><![CDATA[<p>This is the article summary.</p>]]></description>
          <dc:creator>Abel</dc:creator>
        </item>
      </channel>
    </rss>`

    const entries = parseFeedEntries(rssXml, { name: 'blog', url: 'https://example.com/rss.xml', source: 'blog' })
    expect(entries).toHaveLength(1)

    const entry = entries[0]
    expect(entry.id).toBe('feed:blog:post-1-guid')
    expect(entry.type).toBe('feed.post')
    expect(entry.source).toBe('blog')
    expect(entry.title).toBe('New Post & Update')
    expect(entry.description).toBe('This is the article summary.')
    expect(entry.url).toBe('https://example.com/post-1')
    expect(entry.timestamp).toBe('2026-10-05T14:00:00.000Z')
    expect(entry.metadata.author).toBe('Abel')
  })

  it('should parse Atom 1.0 feeds correctly', () => {
    const atomXml = `<?xml version="1.0" encoding="utf-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>Atom Feed</title>
      <entry>
        <id>tag:example.com,2026:atom-post-1</id>
        <title>Atom Release</title>
        <link rel="alternate" href="https://example.com/atom-1"/>
        <published>2026-10-05T12:30:00Z</published>
        <summary>Brief entry summary</summary>
        <author><name>Abel</name></author>
      </entry>
    </feed>`

    const entries = parseFeedEntries(atomXml, { name: 'changelog', url: 'https://example.com/atom.xml' })
    expect(entries).toHaveLength(1)

    const entry = entries[0]
    expect(entry.id).toBe('feed:changelog:tag:example.com,2026:atom-post-1')
    expect(entry.title).toBe('Atom Release')
    expect(entry.url).toBe('https://example.com/atom-1')
    expect(entry.timestamp).toBe('2026-10-05T12:30:00.000Z')
    expect(entry.description).toBe('Brief entry summary')
    expect(entry.metadata.author).toBe('Abel')
  })

  it('should parse JSON Feed 1.1 correctly', () => {
    const jsonFeed = {
      version: 'https://jsonfeed.org/version/1.1',
      title: 'JSON Feed',
      items: [
        {
          id: 'json-item-1',
          url: 'https://example.com/json-1',
          title: 'JSON Feed News',
          summary: 'News details',
          date_published: '2026-10-04T18:00:00Z',
          author: { name: 'Abel' },
        },
      ],
    }

    const entries = parseFeedEntries(jsonFeed, { name: 'news' })
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe('feed:news:json-item-1')
    expect(entries[0].title).toBe('JSON Feed News')
    expect(entries[0].url).toBe('https://example.com/json-1')
    expect(entries[0].timestamp).toBe('2026-10-04T18:00:00.000Z')
    expect(entries[0].metadata.author).toBe('Abel')
  })

  it('should parse Blogger JSON API feeds correctly', () => {
    const bloggerFeed = {
      feed: {
        entry: [
          {
            id: { $t: 'tag:blogger.com,1999:blog-123.post-456' },
            title: { $t: 'Blogger Post' },
            published: { $t: '2026-10-03T16:00:00Z' },
            summary: { $t: '<p>Blogger blog content</p>' },
            link: [
              { rel: 'self', href: 'https://blogger.com/self' },
              { rel: 'alternate', href: 'https://zkreations.com/post-blogger.html' },
            ],
            author: [{ name: { $t: 'Abel' } }],
          },
        ],
      },
    }

    const entries = parseFeedEntries(bloggerFeed, { name: 'blogger', source: 'blogger' })
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe('feed:blogger:tag:blogger.com,1999:blog-123.post-456')
    expect(entries[0].title).toBe('Blogger Post')
    expect(entries[0].url).toBe('https://zkreations.com/post-blogger.html')
    expect(entries[0].description).toBe('Blogger blog content')
    expect(entries[0].metadata.author).toBe('Abel')
  })

  it('should parse WordPress REST API feeds correctly', () => {
    const wpPosts = [
      {
        id: 789,
        date_gmt: '2026-10-02T10:00:00',
        title: { rendered: 'WordPress Post &amp; plugins' },
        link: 'https://example.com/wp-post',
        excerpt: { rendered: '<p>WordPress excerpt</p>' },
      },
    ]

    const entries = parseFeedEntries(wpPosts, { name: 'wordpress' })
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe('feed:wordpress:789')
    expect(entries[0].title).toBe('WordPress Post & plugins')
    expect(entries[0].description).toBe('WordPress excerpt')
    expect(entries[0].timestamp).toBe('2026-10-02T10:00:00.000Z')
  })

  it('should return empty list on invalid or empty content without throwing exceptions', () => {
    expect(parseFeedEntries('', { name: 'empty' })).toEqual([])
    expect(parseFeedEntries(null, { name: 'null' })).toEqual([])
    expect(parseFeedEntries('plain text without format', { name: 'plain' })).toEqual([])
  })
})
