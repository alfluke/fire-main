import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const startedAt = Date.now()
  try {
    // Faz uma consulta leve para validar a conexão
    const userCount = await prisma.user.count()

    const ms = Date.now() - startedAt
    return NextResponse.json({
      ok: true,
      userCount,
      elapsedMs: ms,
      env: {
        nodeEnv: process.env.NODE_ENV,
        nextauthUrl: process.env.NEXTAUTH_URL ?? null,
      },
    })
  } catch (error) {
    const ms = Date.now() - startedAt
    // Não expor segredos; retornar mensagem segura
    return NextResponse.json({
      ok: false,
      elapsedMs: ms,
      error: (error as Error)?.message ?? 'Unknown error',
    }, { status: 500 })
  }
}


