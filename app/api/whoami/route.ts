import { NextResponse } from 'next/server'
import { getViewerContext } from '@/lib/roles'

export async function GET() {
  const ctx = await getViewerContext()
  return NextResponse.json(ctx)
}
