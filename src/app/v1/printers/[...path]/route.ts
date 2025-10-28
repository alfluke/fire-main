export const runtime = 'edge';

const BASE_TARGET = 'https://api.labelary.com';

async function forward(request: Request, params: { path: string[] }) {
  const url = new URL(request.url);
  const path = params.path?.join('/') ?? '';
  const targetUrl = `${BASE_TARGET}/v1/printers/${path}`;

  const headers = new Headers(request.headers);
  // Do not override 'host' header; let fetch set it based on target
  headers.delete('host');
  headers.set('x-forwarded-host', url.host);
  headers.set('x-forwarded-proto', url.protocol.replace(':', ''));

  // Add timeout to avoid hanging upstream calls
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);
  const res = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
    signal: controller.signal
  }).finally(() => clearTimeout(timeoutId));

  return new Response(res.body, {
    status: res.status,
    headers: res.headers
  });
}

export async function GET(request: Request, { params }: { params: { path: string[] } }) {
  return forward(request, params);
}

export async function POST(request: Request, { params }: { params: { path: string[] } }) {
  return forward(request, params);
}

export async function PUT(request: Request, { params }: { params: { path: string[] } }) {
  return forward(request, params);
}

export async function DELETE(request: Request, { params }: { params: { path: string[] } }) {
  return forward(request, params);
}

export async function OPTIONS(request: Request, { params }: { params: { path: string[] } }) {
  return forward(request, params);
}

