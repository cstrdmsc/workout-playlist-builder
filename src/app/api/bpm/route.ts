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

  if (!trackId) {
    return NextResponse.json({ error: 'trackId required' }, { status: 400 })
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
    // ReccoBeats uses Spotify track IDs directly — no search step needed!
    const res = await fetch(`https://api.reccobeats.com/v1/track/${trackId}/audio-features`)

    if (!res.ok) {
      console.log('[reccobeats] no data for', trackName, res.status)
      return NextResponse.json({ trackId, bpm: 0, zone: 'unmatched' })
    }

    const data = await res.json()
    const bpm = Math.round(data?.tempo ?? 0)

    console.log('[reccobeats] BPM for', trackName, ':', bpm)
    const zone = bpm > 0 ? getZone(bpm, zones) : 'unmatched'
    return NextResponse.json({ trackId, bpm, zone })
  } catch (err: any) {
    console.error('[reccobeats] error:', err.message)
    return NextResponse.json({ trackId, bpm: 0, zone: 'unmatched' })
  }
}
