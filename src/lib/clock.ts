/** When this process started, on globalThis: Next.js loads this file once for the API routes and once for the pages. */
const bootedAt = ((globalThis as typeof globalThis & { rephBootedAt?: number }).rephBootedAt ??= Date.now());

/**
 * The app's current time. Use this instead of `new Date()` in routes and services.
 * With DEMO_NOW set (e.g. 2026-09-28T09:00:00+08:00), time starts there when the server starts
 * and then moves forward normally, so the demo scenario always looks the same.
 */
export function now(): Date {
  const demo = process.env.DEMO_NOW;
  if (!demo) return new Date();
  const start = new Date(demo).getTime();
  if (Number.isNaN(start)) return new Date();
  return new Date(start + (Date.now() - bootedAt));
}
