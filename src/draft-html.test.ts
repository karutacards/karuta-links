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
      hiddenAt: null,
      accessOverride: null,
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
    const page = renderDraftEditor(draft, { canAdmin: true, username: 'craig' })
    expect(page).toContain('draft-data')
    expect(page).toContain('id="draft-description"')
    expect(page).toContain('placeholder="Add a description."')
    expect(page).toContain('Lock draft')
    expect(page).not.toContain('Unlock draft')
    expect(page).not.toContain('id="hide-draft"')
    expect(page).toContain('id="draft-config-open">Config<')
    expect(page).toContain('Use global settings')
    expect(page).toContain('/config')
    expect(page).not.toContain('id="draft-review"')
    expect(page).not.toContain('>Download<')
    expect(page).toContain('id="draft-activity"')
    expect(page).toContain('data-restore="1"')
    expect(page).toContain('.activity li.has-restore')
    expect(page).toContain('.activity .restore')
    expect(page).toContain("aria-label', 'Restore'")
    expect(page).toContain('instanceof Element')
    expect(page).toContain('pointer-events: none')
    expect(page).toContain('/restore')
    expect(page).toContain('Save or discard your edits before restoring.')
    expect(page).toContain("rememberLockNotice('restored')")
    expect(page).toContain('after > 0 && events.some')
    expect(page).toContain('This draft was restored to an earlier save.')
    expect(page).toContain('id="draft-history"')
    expect(page).toContain('id="draft-history-kind"')
    expect(page).toContain('id="draft-history-list"')
    expect(page).toContain('.activity .actor')
    expect(page).toContain('.activity .when')
    expect(page).toContain('.activity .save-id')
    expect(page).toContain('.history-log .save-id')
    expect(page).toContain('li.superseded')
    expect(page).toContain('var liveActivityIds')
    expect(page).toContain('var currentEntityHistory')
    expect(page).toContain('var groupDraftActivity')
    expect(page).toContain('.activity-group')
    expect(page).toContain("'Import'")
    expect(page).not.toContain("'Imported'")
    expect(page).toContain('align-items: stretch')
    expect(page).toContain('class="activity-panel"')
    expect(page).toContain('activity-fill')
    expect(page).toContain('function syncActivityHeight')
    expect(page).toContain('min-height: 0')
    expect(page).toContain('max-height: min(100%, calc(100dvh - 2.25rem))')
    expect(page).toContain('"catalog"')
    expect(page).toContain('th.edited, td.edited { display: none; }')
    expect(page).not.toContain('max-height: 70vh')
    expect(page).toContain('id="draft-presence"')
    expect(page).toContain('.presence-avatar')
    expect(page).toContain('margin-inline-start: -0.4rem')
    expect(page).toContain("img.className = 'presence-avatar'")
    expect(page).toContain('class="top-side"')
    expect(page).toContain('position: relative')
    expect(page).toContain('.review-count')
    expect(page).toContain("textContent = 'Existing'")
    expect(page).not.toContain("textContent = 'Update'")
    expect(page).toContain('/events?after=')
    expect(page).not.toContain('Unlocked.')
    expect(page).toContain('data-save="1" disabled')
    expect(page).toContain('id="save-all"')
    expect(page).toContain('Save or discard your edits before locking.')
    expect(page).toContain('.alias-chip.removed')
    expect(page).toContain('tr.row.removed td:not(.acts)')
    expect(page).toContain('.acts button')
    expect(page).toContain('white-space: nowrap')
    expect(page).toContain('td.pending')
    expect(page).toContain('td.conflict')
    expect(page).toContain('var rebaseDraftPending')
    expect(page).not.toContain('__name(')
    expect(page).toContain('function refreshCatalog')
    expect(page).toContain('button.pending:not(:disabled)')
    expect(page).toContain("importAction === 'update'")
    expect(page).toContain('.import-tag')
    expect(page).toContain('.banner.warn')
    expect(page).toContain('position: sticky')
    expect(page).toContain('aliases-cell')
    expect(page).toContain('That character is already on this series.')
    expect(page).toContain('If the name matches Karuta exactly, it will be treated as an update.')
    expect(page).toContain('id="add-series" disabled')
    expect(page).toContain('id="add-character" disabled')
    expect(page).toContain('id="series-sort"')
    expect(page).toContain('id="character-sort"')
    expect(page).toContain('Newest added')
    expect(page).toContain('maxlength="200"')
    expect(page).toContain('var FONT_CODE_POINTS')
    expect(page).toContain('function keepDraftFontText')
    expect(page).toContain('Karuta font cannot display.')
    expect(page).toContain('window.confirm(question)')
    expect(page).toContain('assigned to it in this draft?')
    expect(page).toContain('grid-template-columns: 4.7rem 4.7rem 4.7rem 4.7rem')
    expect(page).toContain('(hover: hover)')
    expect(page).toContain('alias-label')
    expect(page).toContain('button.is-idle')
    expect(page).toContain('text-overflow: ellipsis')
    expect(page).toContain('function rowReadyToSave')
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
      hiddenAt: null,
      accessOverride: null,
      description: 'Season 3 notes.',
      series: [],
      characters: []
    }
    const page = renderDraftEditor(draft, { canAdmin: true, username: 'craig' })
    expect(page).toContain('Locked on ')
    expect(page).not.toContain('Unlocked.')
    expect(page).not.toContain('Lock draft')
    expect(page).toContain('>Download<')
    expect(page).not.toContain('Download importer TXT')
    expect(page).toContain('/export.txt')
    expect(page).toContain('Unlock draft')
    expect(page).toContain('id="hide-draft">Hide<')
    expect(page).not.toContain('id="hide-draft">Unhide<')
    expect(page).not.toContain('This draft is hidden.')
    expect(page).toContain("id === 'hide-draft'")
    expect(page).toContain('status === 404')
    expect(page).toContain('id="draft-review"')
    expect(page).toContain('Ready to publish?')
    expect(page).toContain('text-overflow: ellipsis')
    expect(page).toContain('.review-prompt { display: none; }')
    expect(page).toContain("names.join(', ')")
    expect(page).toContain('tip.textContent = joined')
    expect(page).not.toContain('tip.textContent = joined +')
    expect(page).toContain('id="review-approve-count"')
    expect(page).toContain('id="review-reject-count"')
    expect(page).not.toContain('id="draft-review-votes"')
    expect(page).not.toContain('.review-vote .mention')
    expect(page).toContain('id="review-approve"')
    expect(page).toContain('id="review-reject"')
    expect(page).toContain('The review could not be saved.')
    expect(page).not.toContain('data-restore="1"')
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
      hiddenAt: null,
      accessOverride: null,
      description: 'Season 3 notes.',
      series: [],
      characters: []
    }
    const page = renderDraftEditor(draft, { canAdmin: false, username: 'other' })
    expect(page).toContain('id="draft-description-view"')
    expect(page).toContain('Season 3 notes.')
    expect(page).not.toContain('<textarea id="draft-description"')
    expect(page).not.toContain('data-restore="1"')
    expect(page).not.toContain('id="hide-draft"')
    expect(page).not.toContain('id="draft-config-open"')
  })

  it('shows Unhide to admin ids on a hidden draft', () => {
    const draft: DraftRecord = {
      id: 2,
      createdAt: 1,
      updatedAt: 2,
      lockedAt: 1_700_000_000_000,
      lockedBy: '1',
      hiddenAt: 1_700_000_000_100,
      accessOverride: null,
      description: 'Season 3 notes.',
      series: [],
      characters: []
    }
    const page = renderDraftEditor(draft, { canAdmin: true, username: 'craig' })
    expect(page).toContain('This draft is hidden.')
    expect(page).toContain('id="hide-draft">Unhide<')
    expect(page).not.toContain('id="hide-draft">Hide<')
  })

  it('emits client JavaScript that parses', () => {
    const draft: DraftRecord = {
      id: 2,
      createdAt: 1,
      updatedAt: 2,
      lockedAt: null,
      lockedBy: null,
      hiddenAt: null,
      accessOverride: null,
      description: '',
      series: [],
      characters: []
    }
    const page = renderDraftEditor(draft, { canAdmin: true, username: 'craig' })
    const start = page.indexOf('<script>')
    const end = page.indexOf('</script>', start)
    const script = page.slice(start + 8, end)
    expect(() => new Function(script)).not.toThrow()
    expect(script).toContain("join('\\n')")
  })
})
