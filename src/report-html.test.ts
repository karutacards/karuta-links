import { describe, expect, it } from 'vitest'
import { renderReportForbidden, renderReportForm } from './report-html'
import { emptyReportFields } from './report-validate'

describe('report html', () => {
  it('escapes a validation error and restored field values', () => {
    const page = renderReportForm({
      error: '<script>alert(1)</script>',
      fields: {
        ...emptyReportFields(),
        userIds: '<img src=x>',
        notes: 'Sold "accounts".'
      }
    })
    expect(page).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(page).toContain('&lt;img src=x&gt;')
    expect(page).toContain('Sold &quot;accounts&quot;.')
    expect(page).not.toContain('<script>alert(1)</script>')
  })

  it('prints the forbidden sentence as a complete sentence', () => {
    const page = renderReportForbidden('You cannot use the report form.')
    expect(page).toContain('You cannot use the report form.')
    expect(page).toContain('Report unavailable')
  })

  it('does not use dump or draft chrome', () => {
    const page = renderReportForm()
    expect(page).not.toContain('Card art belongs to its owners.')
    expect(page).not.toContain('Georgia')
    expect(page).not.toContain('#e8c27a')
    expect(page).not.toContain('#12141a')
    expect(page).not.toContain('#0e1116')
    expect(page).toContain('#0b001c')
    expect(page).toContain('#7187dd')
    expect(page).toContain('Karuta')
    expect(page).toContain('noindex')
    expect(page).toContain('textarea.notes')
    expect(page).toContain('class="notes"')
    expect(page).toContain('class="codes"')
    expect(page).toContain('<abbr class="req" title="required">*</abbr>')
    expect(page.match(/<abbr class="req" title="required">\*<\/abbr>/g)?.length).toBe(3)
    expect(page).not.toContain('for="notes">Notes <abbr')
  })
})
