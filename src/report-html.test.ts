import { describe, expect, it } from 'vitest'
import {
  REPORT_EMBED_DESCRIPTION,
  REPORT_EMBED_TITLE,
  REPORT_FORM_LEDE,
  REPORT_OAUTH_START,
  renderReportForbidden,
  renderReportForm,
  renderReportRateLimited,
  renderReportStart,
  renderReportThanks
} from './report-html'
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

  it('exposes embed tags on the unsigned start page', () => {
    const page = renderReportStart()
    expect(page).toContain(`property="og:title" content="${REPORT_EMBED_TITLE}"`)
    expect(page).toContain(`property="og:description" content="${REPORT_EMBED_DESCRIPTION}"`)
    expect(page).toContain(`href="${REPORT_OAUTH_START}"`)
    expect(page).toContain(`0;url=${REPORT_OAUTH_START}`)
    expect(page).toContain('Continue to Discord.')
    expect(page).toContain(REPORT_FORM_LEDE)
  })

  it('thanks the reporter and links back to the form', () => {
    const page = renderReportThanks()
    expect(page).toContain('<title>Karuta report form</title>')
    expect(page).toContain('<h1>Report submitted</h1>')
    expect(page).not.toContain('<h1>Report submitted.</h1>')
    expect(page).toContain('Your report has been received. We will review it when we have time.')
    expect(page).toContain('href="/report"')
    expect(page).toContain('Back to the form')
  })

  it('rate-limits without naming the window', () => {
    const page = renderReportRateLimited()
    expect(page).toContain('You have submitted too many reports in a short timeframe.')
    expect(page).not.toContain('10 reports')
    expect(page).not.toContain('per hour')
    expect(page).not.toContain('Too many reports today.')
  })

  it('prints the forbidden sentence as a complete sentence', () => {
    const page = renderReportForbidden('You cannot use the report form.')
    expect(page).toContain('You cannot use the report form.')
    expect(page).toContain('<title>Karuta report form</title>')
    expect(page).toContain('<h1>Access denied</h1>')
    expect(page).not.toContain('This form is closed for you.')
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
    expect(page).toContain('<title>Karuta report form</title>')
    expect(page).toContain('<h1>Report a player</h1>')
    expect(page).toContain('href="https://karuta.com"')
    expect(page).toContain(REPORT_FORM_LEDE)
    expect(page).not.toContain('Say what happened')
    expect(page).toContain(`property="og:title" content="${REPORT_EMBED_TITLE}"`)
    expect(page).toContain(`property="og:description" content="${REPORT_EMBED_DESCRIPTION}"`)
    expect(page).toContain('noindex')
    expect(page).toContain('textarea.notes')
    expect(page).toContain('class="notes"')
    expect(page).toContain('class="codes"')
    expect(page).toContain('<abbr class="req" title="required">*</abbr>')
    expect(page.match(/<abbr class="req" title="required">\*<\/abbr>/g)?.length).toBe(3)
    expect(page).not.toContain('for="notes">Notes <abbr')
    expect(page).toContain('At least one required')
    expect(page).toContain('id="id-required"')
    expect(page).toContain('Separate several codes with spaces or commas.')
    expect(page).toContain('Up to 10 IDs in each field.')
    expect(page).toContain('Up to 50 codes in each field.')
    expect(page).toContain('Dates related to the offending behavior.')
    expect(page).toContain('Add up to 20.')
    expect(page).toContain('Select the reportable offense.')
    expect(page).toContain('Any additional context that your report requires.')
    expect(page).toContain('500 characters or fewer.')
    expect(page).toContain('maxlength="500"')
    expect(page).toContain('min="2019-11-24"')
    expect(page).toContain('min="2019-11-24"')
    expect(page).toContain('name="offense_dates"')
    expect(page).toContain('id="user_ids-count"')
    expect(page).toContain('id="card_codes-count"')
    expect(page).toContain('id="date-count"')
    expect(page).toContain('id="notes-count"')
    expect(page).toContain('0 / 10')
    expect(page).toContain('0 / 50')
    expect(page).toContain('0 / 20')
    expect(page).toContain('0 / 500')
  })
})
