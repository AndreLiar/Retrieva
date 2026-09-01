// Runtime environment for the browser. A route handler runs on the server at
// REQUEST time, so it reads process.env at RUNTIME (container env), not build time.
// The client loads /__env.js before hydration and reads window.__ENV__ — this is what
// lets ONE image serve every environment (Kargo promotes the same artifact dev->prod).
export const dynamic = 'force-dynamic';

export async function GET() {
  const apiUrl = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? '';
  const body = `window.__ENV__=${JSON.stringify({ API_URL: apiUrl })};`;
  return new Response(body, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
