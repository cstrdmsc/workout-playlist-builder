import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '../auth/[...nextauth]/route'
import { savePlaylist } from '@/lib/spotify'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken || !session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { name, description, trackUris } = body

  if (!name || !trackUris?.length) {
    return NextResponse.json({ error: 'name and trackUris are required' }, { status: 400 })
  }

  try {
    const playlist = await savePlaylist(
      session.accessToken,
      session.user.id,
      name,
      description ?? 'Created by Workout Playlist Builder',
      trackUris
    )
    return NextResponse.json({ playlist })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
