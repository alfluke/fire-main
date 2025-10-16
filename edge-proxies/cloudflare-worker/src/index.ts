export default {
  async fetch(request: Request, env: Record<string, string>, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    // Map path directly to Labelary API under /v1/printers/*
    const target = new URL('https://api.labelary.com');
    target.pathname = url.pathname;
    target.search = url.search;

    const headers = new Headers(request.headers);
    headers.set('host', target.host);
    headers.set('x-forwarded-host', url.host);
    headers.set('x-forwarded-proto', url.protocol.replace(':', ''));

    const res = await fetch(target.toString(), {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual'
    });

    return new Response(res.body, { status: res.status, headers: res.headers });
  }
};








