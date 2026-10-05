export interface ActivityEvent<T = any> {
  id: string
  type: string
  source: string
  title: string
  description: string
  url: string
  timestamp: string
  metadata: T
}

export interface GitHubCommitMetadata {
  repository: string
  branch: string
  author: string
  authorUsername: string | null
  sha: string
  distinct: boolean
}

export interface FeedPostMetadata {
  feedUrl: string
  feedTitle: string
  author: string | null
}

export interface FeedConfig {
  id: string
  url: string
  name: string
  source: string
}

export interface Env {
  DEVLOG_KV: KVNamespace
  GITHUB_WEBHOOK_SECRET?: string
  SYNC_SECRET?: string
  FEED_URLS?: string
  FEEDS_CONFIG?: string
  MAX_EVENTS?: string
  CORS_ORIGIN?: string
  ACTIVITIES_STORAGE_KEY?: string
  ALLOWED_REPOS?: string
  ALLOWED_BRANCHES?: string
}
