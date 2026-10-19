// Shared
import type { GmailAccount, GmailLabel } from '@mnemosyne/shared'

export const gmailAccountFixture = ( overrides: Partial< GmailAccount > = {} ): GmailAccount => {
  return {
    status: 'connected',
    email: 'naresh@example.com',
    connected_at: '2026-10-19T10:00:00.000Z',
    error: null,
    ...overrides,
  }
}

export const gmailLabelFixture = ( overrides: Partial< GmailLabel > = {} ): GmailLabel => {
  return {
    id: 'Label_1',
    name: 'Newsletters',
    type: 'user',
    ...overrides,
  }
}
