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
  const trackName = searchParams.get('trackName') ?? ''
  const trackArtist = searchParams.get('trackArtist') ?? ''

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

  try {
    const query = encodeURIComponent(`${trackName} ${trackArtist}`.trim())

    // Step 1: Search Deezer for the track
    const searchRes = await fetch(`https://api.deezer.com/search/track?q=${query}&limit=1`)
    const searchData = await searchRes.json()
    const deezerTrackId = searchData?.data?.[0]?.id

    if (!deezerTrackId) {
      console.log('[deezer] no match for', trackName)
      return NextResponse.json({ trackId, bpm: 0, zone: 'unmatched' })
    }

    // Step 2: Get full track which includes BPM field
    const trackRes = await fetch(`https://api.deezer.com/track/${deezerTrackId}`)
    const trackData = await trackRes.json()
    const bpm = Math.round(trackData?.bpm ?? 0)

    console.log('[deezer] BPM for', trackName, ':', bpm)
    const zone = bpm > 0 ? getZone(bpm, zones) : 'unmatched'
    return NextResponse.json({ trackId, bpm, zone })
  } catch (err: any) {
    console.error('[deezer] error:', err.message)
    return NextResponse.json({ trackId, bpm: 0, zone: 'unmatched' })
  }
}
