// Notification stream of the interface (Server-Sent Events), the agent's pending work and its launch in a terminal.
import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { isActionAgent, stateWork } from '../work.ts';
import type { RoutesContext } from './context.ts';

export function routesAgent(app: Hono, ctx: RoutesContext): void {
  const { db, config, m, broadcast, emails, launcher } = ctx;

  // Notifications (Server-Sent Events): "database" (data modified), "emails" (inbox).
  app.get('/api/stream', (c) =>
    streamSSE(c, async (stream) => {
      let finish = () => {};
      const finished = new Promise<void>((r) => (finish = r));
      const unsubscribe = broadcast.subscribe((n) => {
        stream.writeSSE({ event: n.type, data: JSON.stringify(n) }).catch(() => finish());
      });
      stream.onAbort(() => finish());
      await stream.writeSSE({ event: 'ready', data: '{}' });
      // Regular comment: keeps the connection open through proxies (does not count as activity).
      const heartbeat = setInterval(() => stream.write(': heartbeat\n\n').catch(() => finish()), 25_000);
      await finished;
      clearInterval(heartbeat);
      unsubscribe();
    }),
  );

  // Pending work for the agent, and launch of the agent in a terminal (interface buttons).
  app.get('/api/work', (c) => c.json(stateWork(db, { dataDir: config.dataDir, emails })));

  app.post('/api/work/:action', async (c) => {
    const action = c.req.param('action');
    if (!isActionAgent(action)) return c.json({ ok: false, error: m('api.actionUnknown') }, 404);
    if (!(c.req.header('content-type') ?? '').includes('application/json')) {
      return c.json({ ok: false, error: m('api.jsonExpected') }, 415);
    }
    await launcher(action, config.dataDir);
    return c.json({ ok: true, action });
  });
}
