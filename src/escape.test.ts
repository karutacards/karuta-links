import { describe, expect, it } from 'vitest'
import { escapeHtml } from './escape'

describe('escapeHtml', () => {
  it('escapes markup characters', () => {
    expect(escapeHtml(`<img src="x" alt='y'>&`)).toBe(
      '&lt;img src=&quot;x&quot; alt=&#39;y&#39;&gt;&amp;'
    )
  })
})
