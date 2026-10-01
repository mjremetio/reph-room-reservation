/** Emails identify people across the app (demo user now, Entra ID in Phase 3). Case never matters. */
export function sameEmail(a: string | undefined, b: string | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/**
 * The people whose name has every word of `query` as the start of one of its words (any case or order, commas
 * ignored): "lili", "Lili Lagunoy" and "Lagunoy, Lili" all find "Lagunoy, Lili". An e-mail address finds its person.
 */
export function matchPeople<P extends { name: string; email?: string }>(people: readonly P[], query: string): P[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const byEmail = people.filter((p) => sameEmail(p.email, q));
  if (byEmail.length > 0) return byEmail;
  const words = q.split(/[\s,]+/).filter(Boolean);
  return people.filter((p) => {
    const name = p.name.toLowerCase().split(/[\s,.]+/).filter(Boolean);
    return words.every((w) => name.some((n) => n.startsWith(w)));
  });
}
