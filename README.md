# Devlog Activity Worker

A **Cloudflare Worker** that acts as a centralized, public activity feed. It aggregates events from multiple heterogeneous sources, normalizes them into a common format, and stores them in **Cloudflare KV** within a strict sliding window of the **50 most recent events**. It exposes a public API consumable via `fetch()`.

## Supported Sources

1. **GitHub Webhooks (`POST /webhooks/github`)**: Receives real-time `push` events, validates HMAC-SHA256 cryptographic signatures, and extracts relevant commits.
2. **Universal Feeds (`scheduled` / `POST /sync/feeds`)**: Built-in, zero-dependency parsing support for:
   - **RSS 2.0**
   - **Atom 1.0**
   - **JSON Feed 1.1**
   - **Blogger / Google Feed API**
   - **WordPress REST API**

---

## Architecture

```
GitHub Webhooks ──────┐
Feeds (RSS / Atom) ───┤
Blogger / WordPress ──┤
                      ▼
         Normalized Event (Activity)
                      ▼
         Cloudflare KV (Max 50 events)
                      ▼
               GET /activity
                      ▼
             Web Client (fetch)
```

### Common Event Schema

```json
{
  "id": "unique-event-id",
  "type": "github.commit | feed.post",
  "source": "github | blog | ...",
  "title": "Event title or message",
  "description": "Event description or extended content",
  "url": "https://...",
  "timestamp": "2026-10-05T18:30:00.000Z",
  "metadata": {
    "repository": "user/repo",
    "branch": "main",
    "author": "Name",
    "sha": "..."
  }
}
```

---

## Project Structure

```
devlog/
├── package.json          # ESM configuration, TypeScript, and pnpm scripts
├── tsconfig.json         # Strict TypeScript compiler options & Workers types
├── wrangler.jsonc        # Cloudflare Worker, KV binding, and Cron Triggers configuration
├── vitest.config.js      # Unit test configuration
├── src/
│   ├── index.ts          # Fetch router and scheduled cron handler
│   ├── types.ts          # Core TypeScript interfaces (ActivityEvent, Env, etc.)
│   ├── config.ts         # Environment variable parsing and defaults
│   ├── routes/
│   │   ├── activity.ts   # GET /activity with CORS and limit query parameter
│   │   ├── webhooks.ts   # POST /webhooks/github with HMAC SHA-256 validation
│   │   └── sync.ts       # POST /sync/feeds with authorization token
│   ├── sources/
│   │   ├── github.ts     # Signature validator and commit normalizer
│   │   └── feed.ts       # Universal feed parser (RSS, Atom, JSON, Blogger, WP)
│   ├── storage/
│   │   └── activities.ts # KV persistence layer with deduplication and 50-event window
│   └── utils/
│       ├── xml.ts        # XML/CDATA entity decoding and regex extractors
│       └── crypto.ts     # Constant-time HMAC-SHA256 and hashing
├── test/
│   ├── storage.test.ts
│   ├── github-source.test.ts
│   ├── feed-source.test.ts
│   ├── routes.test.ts
│   └── mocks/
│       └── kv.mock.ts
└── README.md
```

---

## Requirements and Local Setup

This project uses **`pnpm`** and **TypeScript**.

```bash
# 1. Install dependencies
pnpm install

# 2. Run static type checking
pnpm run typecheck

# 3. Run automated tests (Vitest)
pnpm test

# 4. Start local development environment with Wrangler
pnpm run dev
```

---

## Cloudflare Workers Deployment

### 1. Create the KV Namespace

Run the following command to create your Cloudflare KV namespace:

```bash
pnpm exec wrangler kv namespace create DEVLOG_KV
```

You will receive output similar to:
```
Add the following to your configuration file:
kv_namespaces = [
  { binding = "DEVLOG_KV", id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }
]
```

Copy the generated `id` and update `wrangler.jsonc`:

```jsonc
{
  "kv_namespaces": [
    {
      "binding": "DEVLOG_KV",
      "id": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    }
  ]
}
```

### 2. Configure Worker Secrets

Store the secret used to authenticate GitHub webhooks:

```bash
pnpm exec wrangler secret put GITHUB_WEBHOOK_SECRET
```
*(Enter a secure random string, e.g. generated via `openssl rand -hex 24`)*

Optionally, store a secret token to trigger feed synchronizations on-demand:

```bash
pnpm exec wrangler secret put SYNC_SECRET
```

### 3. Configure Monitored Feeds

You can configure feeds via environment variables in the Cloudflare Dashboard or under `vars` in `wrangler.jsonc`:

```jsonc
{
  "vars": {
    "FEED_URLS": "https://zkreations.com/feeds/posts/default,https://my-blog.com/rss.xml"
  }
}
```

Or as a JSON array with custom labels:

```jsonc
{
  "vars": {
    "FEEDS_CONFIG": "[{\"url\":\"https://zkreations.com/feeds/posts/default\",\"name\":\"Blog\",\"source\":\"blogger\"}]"
  }
}
```

### 4. Deploy the Worker

```bash
pnpm run deploy
```

---

## GitHub Webhook Configuration

1. In your GitHub repository, navigate to: **Settings** > **Webhooks** > **Add webhook**.
2. **Payload URL**: `https://<your-worker>.workers.dev/webhooks/github`
3. **Content type**: `application/json`
4. **Secret**: The exact value configured in `GITHUB_WEBHOOK_SECRET`.
5. **Which events would you like to trigger this webhook?**: Choose **Just the push event**.
6. Click **Add webhook**.

---

## Public API

### `GET /activity`

Returns recent events ordered from newest to oldest.

#### Query Parameters
- `limit` *(optional)*: Maximum number of events to return (defaults to `50`, capped at `50`).

#### Example Request
```bash
curl https://<your-worker>.workers.dev/activity?limit=20
```

#### Example Response
```json
{
  "activities": [
    {
      "id": "github:commit:a1b2c3d4e5f6",
      "type": "github.commit",
      "source": "github",
      "title": "feat: add dark mode support",
      "description": "feat: add dark mode support\n\nImplements auto theme detection and switch toggle.",
      "url": "https://github.com/zkreations/whale/commit/a1b2c3d4e5f6",
      "timestamp": "2026-10-05T18:30:00.000Z",
      "metadata": {
        "repository": "zkreations/whale",
        "branch": "main",
        "author": "Abel",
        "authorUsername": "zkreations",
        "sha": "a1b2c3d4e5f6"
      }
    }
  ],
  "count": 1
}
```

---

## Manual Feed Synchronization

### `POST /sync/feeds`

Allows triggering feed collection on demand (e.g., from a GitHub Action or immediately after publishing a new blog post):

```bash
curl -X POST https://<your-worker>.workers.dev/sync/feeds \
  -H "Authorization: Bearer <YOUR_SYNC_SECRET>"
```

---

## Web Client Integration Example (Frontend)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Recent Activity</title>
  <style>
    .activity-feed { max-width: 600px; margin: 2rem auto; font-family: system-ui, sans-serif; }
    .activity-item { display: flex; gap: 1rem; padding: 1rem 0; border-bottom: 1px solid #e5e7eb; }
    .badge { font-size: 0.75rem; font-weight: bold; padding: 0.2rem 0.5rem; border-radius: 9999px; text-transform: uppercase; }
    .badge-github { background: #24292e; color: #fff; }
    .badge-blog { background: #f97316; color: #fff; }
    .activity-title { font-weight: 600; text-decoration: none; color: #111827; }
    .activity-title:hover { text-decoration: underline; }
    .activity-meta { font-size: 0.85rem; color: #6b7280; margin-top: 0.25rem; }
  </style>
</head>
<body>
  <div class="activity-feed">
    <h2>Recent Activity</h2>
    <div id="timeline"><p>Loading activity...</p></div>
  </div>

  <script>
    const WORKER_URL = "https://<your-worker>.workers.dev/activity?limit=15";

    function formatRelativeTime(isoString) {
      const date = new Date(isoString);
      const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
      const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
      const intervals = [
        { unit: 'day', seconds: 86400 },
        { unit: 'hour', seconds: 3600 },
        { unit: 'minute', seconds: 60 }
      ];
      for (const { unit, seconds } of intervals) {
        if (Math.abs(diffSeconds) >= seconds || unit === 'minute') {
          return rtf.format(Math.round(diffSeconds / seconds), unit);
        }
      }
      return 'just now';
    }

    async function loadActivity() {
      const timeline = document.getElementById("timeline");
      try {
        const res = await fetch(WORKER_URL);
        const { activities } = await res.json();
        if (!activities.length) {
          timeline.innerHTML = "<p>No recent activity found.</p>";
          return;
        }

        timeline.innerHTML = activities.map(item => `
          <article class="activity-item">
            <div>
              <span class="badge ${item.source === 'github' ? 'badge-github' : 'badge-blog'}">
                ${item.source === 'github' ? 'Commit' : 'Post'}
              </span>
            </div>
            <div>
              <a class="activity-title" href="${item.url}" target="_blank" rel="noopener noreferrer">
                ${item.title}
              </a>
              <div class="activity-meta">
                <time datetime="${item.timestamp}">${formatRelativeTime(item.timestamp)}</time>
              </div>
            </div>
          </article>
        `).join('');
      } catch (err) {
        timeline.innerHTML = `<p>Error loading activity: ${err.message}</p>`;
      }
    }

    loadActivity();
  </script>
</body>
</html>
```

---

## License

[MIT](LICENSE)