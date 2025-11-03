import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TEST_ZPL = '^XA^FO50,50^ADN,36,20^FDTEST^FS^XZ'

function dpiToDpmm(dpi: number): number {
  switch (dpi) { case 203: return 8; case 300: return 12; case 600: return 24; default: return 8 }
}

export async function GET() {
  const bases = (process.env.LABELARY_BASE_URLS || 'https://api.labelary.com')
    .split(',').map(s => s.trim()).filter(Boolean)
  const results: any[] = []

  for (const base of bases) {
    const dpmm = dpiToDpmm(203)
    const path = `/v1/printers/${dpmm}dpmm/labels/4x6/0`
    const url = `${base.replace(/\/$/, '')}${path}`
    let status = 0
    let ok = false
    let err: string | null = null
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'image/png',
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Fire-Studio-Healthz',
        },
        body: TEST_ZPL
      })
      status = res.status
      ok = res.ok
      // consume body to close connection
      await res.arrayBuffer().catch(() => undefined)
    } catch (e: any) {
      err = e?.message || String(e)
    }
    results.push({ base, status, ok, err })
  }

  return NextResponse.json({ ok: true, results })
}


