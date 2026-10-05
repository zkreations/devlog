import type { ActivityEvent, GitHubCommitMetadata } from '../types.js'
import { verifyHmacSha256 } from '../utils/crypto.js'

export async function verifyGitHubSignature(
  secret: string | undefined | null,
  rawBody: string | undefined | null,
  signatureHeader: string | undefined | null,
): Promise<boolean> {
  return verifyHmacSha256(secret, rawBody, signatureHeader)
}

interface RawGitHubCommit {
  id?: string
  sha?: string
  message?: string
  timestamp?: string
  url?: string
  author?: {
    name?: string
    username?: string
  }
  distinct?: boolean
}

interface RawGitHubPayload {
  ref?: string
  repository?: {
    full_name?: string
  }
  commits?: RawGitHubCommit[]
}

export function parseGitHubWebhook(
  payload: RawGitHubPayload | null | undefined,
  allowedRepos: string[] = [],
  allowedBranches: string[] = [],
): ActivityEvent<GitHubCommitMetadata>[] {
  if (!payload || typeof payload !== 'object') {
    return []
  }

  const repoFullName = payload.repository?.full_name || ''
  if (allowedRepos.length > 0) {
    const isRepoAllowed = allowedRepos.some(r => r.toLowerCase() === repoFullName.toLowerCase())
    if (!isRepoAllowed) {
      return []
    }
  }

  const ref = payload.ref || ''
  const branch = ref.startsWith('refs/heads/') ? ref.replace('refs/heads/', '') : ref
  if (allowedBranches.length > 0 && branch) {
    const isBranchAllowed = allowedBranches.includes(branch)
    if (!isBranchAllowed) {
      return []
    }
  }

  const commits = Array.isArray(payload.commits) ? payload.commits : []
  if (commits.length === 0) {
    return []
  }

  return commits.map((commit): ActivityEvent<GitHubCommitMetadata> => {
    const message = (commit.message || '').trim()
    const firstLine = message.split('\n')[0].trim()

    let timestamp = commit.timestamp
    if (!timestamp || Number.isNaN(new Date(timestamp).getTime())) {
      timestamp = new Date().toISOString()
    }
    else {
      timestamp = new Date(timestamp).toISOString()
    }

    const sha = commit.id || commit.sha || ''

    return {
      id: `github:commit:${sha}`,
      type: 'github.commit',
      source: 'github',
      title: firstLine || 'Commit without message',
      description: message,
      url: commit.url || (repoFullName && sha ? `https://github.com/${repoFullName}/commit/${sha}` : ''),
      timestamp,
      metadata: {
        repository: repoFullName,
        branch,
        author: commit.author?.name || 'Unknown',
        authorUsername: commit.author?.username || null,
        sha,
        distinct: Boolean(commit.distinct),
      },
    }
  }).filter(event => Boolean(event.metadata.sha))
}
