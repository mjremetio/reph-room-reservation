/** GET /api/health – configuration at a glance, no secrets (docs/spec/04-api.md). */
import { now } from '../../../lib/clock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return Response.json({
    ok: true,
    gateway: process.env.RESERVATION_GATEWAY ?? 'mock',
    scenario: process.env.MOCK_SCENARIO ?? 'demo',
    openai: process.env.OPENAI_API_KEY ? 'configured' : 'missing',
    model: process.env.OPENAI_MODEL || 'SDK default',
    /** "demo": the clock replays DEMO_NOW; "real": the actual time. Always shown in Asia/Manila. */
    clock: process.env.DEMO_NOW ? 'demo' : 'real',
    now: now().toISOString(),
  });
}
