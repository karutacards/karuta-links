import { describe, expect, it } from 'vitest'
import { renderDraftEditor, renderDraftImport } from './draft-html'
import type { DraftRecord } from './draft-types'

describe('draft HTML', () => {
  it('renders last-editor chips and the import handshake page', () => {
    const draft: DraftRecord = {
      id: 2,
      createdAt: 1,
      updatedAt: 2,
      lockedAt: null,
      lockedBy: null,
      series: [{
        type: 'series',
        key: 'new-series',
        name: 'New Series',
        aliases: ['Alt'],
        revision: 3,
        lastEditorId: '1',
        lastEditorName: 'craig'
      }],
      characters: []
    }
    const page = renderDraftEditor(draft, { canLock: true, username: 'craig' })
    expect(page).toContain('draft-data')
    expect(page).toContain('Lock draft')
    expect(page).toContain('Add series')
    expect(renderDraftImport()).toContain('krtaDraftImport')
  })
})
