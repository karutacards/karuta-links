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
    expect(page).toContain('id="draft-activity"')
    expect(page).toContain('id="draft-history"')
    expect(page).toContain('id="draft-history-kind"')
    expect(page).toContain('id="draft-history-list"')
    expect(page).toContain('.activity .actor')
    expect(page).toContain('.activity .when')
    expect(page).toContain('id="draft-presence"')
    expect(page).toContain('/events?after=')
    expect(page).not.toContain('Unlocked.')
    expect(page).toContain('data-save="1" disabled')
    expect(page).toContain('Add series')
    expect(page).toContain('Add alias')
    expect(page).toContain('color-scheme: dark')
    expect(page).toContain('<table>')
    expect(page).toContain('Last edited')
    expect(page).toContain('alias-chip')
    expect(page).not.toContain('class="cards"')
    expect(page).not.toContain('class="compose"')
    expect(page).not.toContain("textContent = 'Remove'")
    expect(page).not.toContain('Separate aliases with |.')
    expect(page).toContain('role="status"')
    expect(page).not.toContain('href="/"')
    expect(page).not.toContain('Card art belongs to its owners.')
    expect(page).not.toContain('<header>')
    expect(page).not.toContain('<footer>')
    expect(renderDraftImport()).toContain('krtaDraftImport')
    expect(renderDraftImport()).not.toContain('href="/"')
  })

  it('shows a lock timestamp only after the draft is locked', () => {
    const draft: DraftRecord = {
      id: 2,
      createdAt: 1,
      updatedAt: 2,
      lockedAt: 1_700_000_000_000,
      lockedBy: '1',
      series: [],
      characters: []
    }
    const page = renderDraftEditor(draft, { canLock: true, username: 'craig' })
    expect(page).toContain('Locked ')
    expect(page).not.toContain('Unlocked.')
    expect(page).not.toContain('Lock draft')
    expect(page).toContain('Export CSV')
  })
})
