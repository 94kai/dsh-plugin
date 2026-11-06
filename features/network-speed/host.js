import { createSpeedTestServer } from './server.js';

// The Connection registry applies DSH's existing login and Origin checks.
// No new listening port, alternate authentication or external service is used.
export const inject = ['connection'];
export function apply(ctx) {
  ctx.effect(() => {
    const server = createSpeedTestServer();
    const unregister = [];
    try {
      for (const route of server.routes) unregister.push(ctx.connection.fetch.register(route));
    } catch (error) {
      server.dispose();
      for (const dispose of unregister) void Promise.resolve(dispose()).catch(() => {});
      throw error;
    }
    return async () => {
      server.dispose();
      await Promise.all(unregister.map(dispose => dispose()));
    };
  });
}
