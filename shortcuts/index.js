import { readFile } from 'node:fs/promises';

export const inject = ['connection'];

export function apply(ctx) {
  // Ordinary JSON snapshot; no credential store or separate authentication flow.
  // Connection's existing owner login protects the API just like the rest of DSH.
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/shortcuts/bookmarks', methods: ['GET'], requestBody: 'buffered',
    async fetch() {
      try {
        const items = JSON.parse(await readFile(new URL('./bookmarks.json', import.meta.url), 'utf8'));
        return Response.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
      } catch {
        return Response.json({ error: 'Unable to read bookmarks' }, { status: 500 });
      }
    },
  }));
}
