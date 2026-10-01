/**
 * Microsoft Teams deep link that opens a chat with a pre-filled message.
 * Confirm the format with IT; Teams deep links sometimes change.
 */
export function teamsChatLink(email: string, message: string): string {
  return `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(email)}&message=${encodeURIComponent(message)}`;
}

export function mailtoLink(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
