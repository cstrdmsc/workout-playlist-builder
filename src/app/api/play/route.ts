import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { deviceId, trackId } = await req.json()
  if (!deviceId || !trackId) {
    return NextResponse.json({ error: 'deviceId and trackId required' }, { status: 400 })
  }

  try {
    // Transfer playback to our device
    await fetch('https://api.spotify.com/v1/me/player', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ device_ids: [deviceId], play: false }),
    })

    await new Promise((r) => setTimeout(r, 300))

    // Play the track
    const res = await fetch(
      `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uris: [`spotify:track:${trackId}`] }),
      }
    )

    console.log('[play] Spotify response:', res.status)
    return NextResponse.json({ status: res.status })
  } catch (err: any) {
    console.error('[play] error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
