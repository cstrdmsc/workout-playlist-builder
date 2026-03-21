import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { getUserPlaylists } from '@/lib/spotify'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const playlists = await getUserPlaylists(session.accessToken)
    return NextResponse.json({ playlists })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
