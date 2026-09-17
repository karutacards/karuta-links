export const CARD_CDN_BASE = 'https://d2l56h9h5tj8ue.cloudfront.net/images'

export function cardImageUrl(key: string, edition: string, version = 0): string {
  if (version > 0) {
    return `${CARD_CDN_BASE}/cards/versioned/${key}-${edition}-${version}.jpg`
  }
  return `${CARD_CDN_BASE}/cards/${key}-${edition}.jpg`
}
