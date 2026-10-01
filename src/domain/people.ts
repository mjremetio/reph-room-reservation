/** Emails identify people across the app (demo user now, Entra ID in Phase 3). Case never matters. */
export function sameEmail(a: string | undefined, b: string | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}
