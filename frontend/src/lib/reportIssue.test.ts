import { describe, expect, it } from 'vitest'
import { EMPTY_REPORT, buildReportRequest, captureContext, isReportValid } from './reportIssue'

describe('isReportValid', () => {
  it('requires a non-empty headline and description', () => {
    expect(isReportValid(EMPTY_REPORT)).toBe(false)
    expect(isReportValid({ ...EMPTY_REPORT, title: 'x' })).toBe(false)
    expect(isReportValid({ ...EMPTY_REPORT, title: '  ', description: 'y' })).toBe(false)
    expect(isReportValid({ ...EMPTY_REPORT, title: 'x', description: 'y' })).toBe(true)
  })
})

describe('buildReportRequest', () => {
  const ctx = { role: 'OF-4', view: 'tactical' }

  it('keeps severity for a bug and trims fields', () => {
    const req = buildReportRequest(
      { title: '  Route bug  ', kind: 'bug', scope: 'of4', description: ' broke ', severity: 'major', contact: ' me@x.io ' },
      ctx,
    )
    expect(req.title).toBe('Route bug')
    expect(req.description).toBe('broke')
    expect(req.severity).toBe('major')
    expect(req.contact).toBe('me@x.io')
    expect(req.context).toBe(ctx)
    expect(req.hp).toBe('')
  })

  it('drops severity for a suggestion and nulls blank optionals', () => {
    const req = buildReportRequest(
      { title: 'Idea', kind: 'suggestion', scope: 'both', description: 'do this', severity: 'blocker', contact: '   ' },
      ctx,
    )
    expect(req.severity).toBeNull()
    expect(req.contact).toBeNull()
  })

  it('passes a honeypot value through so the backend can drop it', () => {
    const req = buildReportRequest({ ...EMPTY_REPORT, title: 't', description: 'd' }, ctx, 'bot')
    expect(req.hp).toBe('bot')
  })
})

describe('captureContext', () => {
  it('records role, view and a user agent', () => {
    const c = captureContext('OF-8', 'supply')
    expect(c.role).toBe('OF-8')
    expect(c.view).toBe('supply')
    expect(typeof c.user_agent).toBe('string')
    expect(c.app_version).toBeTruthy()
  })
})
