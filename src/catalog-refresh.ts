export const CATALOG_REFRESH_EVENT = 'karuta-catalog-refresh'

export type CatalogRefreshEnv = {
  GITHUB_DISPATCH_TOKEN?: string
  CATALOG_DISPATCH_REPO?: string
}

const REPO_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/

export function catalogDispatchRepo(env: CatalogRefreshEnv): string | null {
  const repo = env.CATALOG_DISPATCH_REPO?.trim() ?? ''
  return REPO_PATTERN.test(repo) ? repo : null
}

export async function dispatchCatalogRefresh(
  env: CatalogRefreshEnv,
  contentId: number
): Promise<void> {
  const token = env.GITHUB_DISPATCH_TOKEN?.trim() ?? ''
  const repo = catalogDispatchRepo(env)
  if (!token || !repo) {
    return
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'krta.cc-catalog-refresh'
      },
      body: JSON.stringify({
        event_type: CATALOG_REFRESH_EVENT,
        client_payload: { contentId }
      })
    })
    if (!response.ok) {
      console.warn(`catalog refresh dispatch failed: ${response.status}`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    console.warn(`catalog refresh dispatch failed: ${message}`)
  }
}
