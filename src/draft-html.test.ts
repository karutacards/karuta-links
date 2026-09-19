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
      description: '',
      series: [{
        type: 'series',
        key: 'new-series',
        name: 'New Series',
        aliases: ['Alt'],
        importAction: 'add',
        baseAliases: [],
        revision: 3,
        lastEditorId: '1',
        lastEditorName: 'craig'
      }],
      characters: []
    }
    const page = renderDraftEditor(draft, { canLock: true, username: 'craig' })
    expect(page).toContain('draft-data')
    expect(page).toContain('id="draft-description"')
    expect(page).toContain('placeholder="Add a description."')
    expect(page).toContain('Lock draft')
    expect(page).not.toContain('Unlock draft')
    expect(page).not.toContain('>Download<')
    expect(page).toContain('id="draft-activity"')
    expect(page).toContain('id="draft-history"')
    expect(page).toContain('id="draft-history-kind"')
    expect(page).toContain('id="draft-history-list"')
    expect(page).toContain('.activity .actor')
    expect(page).toContain('.activity .when')
    expect(page).toContain('align-items: stretch')
    expect(page).toContain('min-height: 0')
    expect(page).toContain('max-height: calc(100dvh - 2.25rem)')
    expect(page).toContain('"catalog"')
    expect(page).toContain('th.edited, td.edited { display: none; }')
    expect(page).not.toContain('max-height: 70vh')
    expect(page).toContain('id="draft-presence"')
    expect(page).toContain('/events?after=')
    expect(page).not.toContain('Unlocked.')
    expect(page).toContain('data-save="1" disabled')
    expect(page).toContain("importAction === 'update'")
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
      description: 'Season 3 notes.',
      series: [],
      characters: []
    }
    const page = renderDraftEditor(draft, { canLock: true, username: 'craig' })
    expect(page).toContain('Locked ')
    expect(page).not.toContain('Unlocked.')
    expect(page).not.toContain('Lock draft')
    expect(page).toContain('>Download<')
    expect(page).not.toContain('Download importer TXT')
    expect(page).toContain('/export.txt')
    expect(page).toContain('Unlock draft')
    expect(page).toContain('id="draft-description"')
    expect(page).toContain('Season 3 notes.')
  })

  it('shows a read-only description to editors who cannot lock', () => {
    const draft: DraftRecord = {
      id: 2,
      createdAt: 1,
      updatedAt: 2,
      lockedAt: null,
      lockedBy: null,
      description: 'Season 3 notes.',
      series: [],
      characters: []
    }
    const page = renderDraftEditor(draft, { canLock: false, username: 'other' })
    expect(page).toContain('id="draft-description-view"')
    expect(page).toContain('Season 3 notes.')
    expect(page).not.toContain('<textarea id="draft-description"')
  })
})
