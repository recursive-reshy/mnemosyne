// The message in Gmail's web app, in the account it arrived in. Without the address (Gmail was
// disconnected and the item kept) the first signed-in account is the best guess.
export const gmailLink = (
  { email, messageId }: { email: string | null, messageId: string },
): string => {
  const account = email === null ? '0' : encodeURIComponent( email )

  return `https://mail.google.com/mail/u/${ account }/#all/${ messageId }`
}
