import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { getZone, DEFAULT_ZONES, ZoneConfig } from '@/lib/bpm'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const trackId = searchParams.get('trackId')
  const trackName = searchParams.get('trackName')
  const trackArtist = searchParams.get('trackArtist')

  if (!trackId || !trackName) {
    return NextResponse.json({ error: 'trackId and trackName required' }, { status: 400 })
  }

  const zones: ZoneConfig = {
    warmup: {
      min: Number(searchParams.get('warmupMin') ?? DEFAULT_ZONES.warmup.min),
      max: Number(searchParams.get('warmupMax') ?? DEFAULT_ZONES.warmup.max),
    },
    peak: {
      min: Number(searchParams.get('peakMin') ?? DEFAULT_ZONES.peak.min),
      max: Number(searchParams.get('peakMax') ?? DEFAULT_ZONES.peak.max),
    },
    cooldown: {
      min: Number(searchParams.get('cooldownMin') ?? DEFAULT_ZONES.cooldown.min),
      max: Number(searchParams.get('cooldownMax') ?? DEFAULT_ZONES.cooldown.max),
    },
  }

  const AUDD_KEY = process.env.AUDD_API_KEY
  if (!AUDD_KEY) {
    return NextResponse.json({ error: 'AUDD_API_KEY not configured' }, { status: 500 })
  }

  try {
    // Try AudD song search with Spotify data return
    const body = new URLSearchParams({
      api_token: AUDD_KEY,
      q: `${trackName} ${trackArtist ?? ''}`.trim(),
      return: 'spotify',
    })

    const res = await fetch('https://api.audd.io/findLyrics/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })

    const data = await res.json()
    console.log('[bpm] AudD response for', trackName, ':', JSON.stringify(data).slice(0, 200))

    let bpm = 0

    // Try to get BPM from Spotify data returned by AudD
    const spotifyInfo = data?.result?.[0]?.spotify
    if (spotifyInfo?.tempo) {
      bpm = Math.round(spotifyInfo.tempo)
    }

    // Fallback: try the main AudD endpoint
    if (!bpm) {
      const res2 = await fetch('https://api.audd.io/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          api_token: AUDD_KEY,
          q: `${trackName} ${trackArtist ?? ''}`.trim(),
          return: 'spotify',
        }),
      })
      const data2 = await res2.json()
      console.log('[bpm] AudD fallback for', trackName, ':', JSON.stringify(data2).slice(0, 200))
      bpm = Math.round(data2?.result?.spotify?.tempo ?? 0)
    }

    const zone = bpm > 0 ? getZone(bpm, zones) : 'unmatched'
    return NextResponse.json({ trackId, bpm, zone })
  } catch (err: any) {
    console.error('[bpm] error:', err.message)
    return NextResponse.json({ trackId, bpm: 0, zone: 'unmatched' })
  }
}
