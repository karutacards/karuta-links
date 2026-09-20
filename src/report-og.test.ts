import { describe, expect, it } from 'vitest'
import { renderReportStart } from './report-html'
import {
  REPORT_OG_BYTES,
  REPORT_OG_CONTENT_TYPE,
  REPORT_OG_HEIGHT,
  REPORT_OG_PATH,
  REPORT_OG_URL,
  REPORT_OG_WIDTH
} from './report-og'

describe('report og thumbnail', () => {
  it('sets a summary-card thumbnail and no favicon', () => {
    const page = renderReportStart()
    expect(page).toContain(`property="og:image" content="${REPORT_OG_URL}"`)
    expect(page).toContain('name="twitter:card" content="summary"')
    expect(page).not.toContain('rel="icon"')
    expect(page).not.toContain('favicon')
  })

  it('is a 256-pixel WebP with a public production URL', () => {
    expect(REPORT_OG_PATH).toBe('/report-og.webp')
    expect(REPORT_OG_URL).toBe('https://krta.cc/report-og.webp')
    expect(REPORT_OG_CONTENT_TYPE).toBe('image/webp')
    expect(REPORT_OG_WIDTH).toBe(256)
    expect(REPORT_OG_HEIGHT).toBe(256)
    expect(String.fromCharCode(...REPORT_OG_BYTES.slice(0, 4))).toBe('RIFF')
    expect(String.fromCharCode(...REPORT_OG_BYTES.slice(8, 12))).toBe('WEBP')
    expect(REPORT_OG_BYTES.byteLength).toBeLessThan(90_000)
  })
})
