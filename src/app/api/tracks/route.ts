import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { getPlaylistTracks, getAudioFeatures } from '@/lib/spotify'
import { mergeTracksWithFeatures, sortForWorkout, DEFAULT_ZONES, ZoneConfig } from '@/lib/bpm'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const playlistId = searchParams.get('playlistId')
  if (!playlistId) {
    return NextResponse.json({ error: 'playlistId is required' }, { status: 400 })
  }

  // Accept optional custom zone config from query params
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
    const tracks = await getPlaylistTracks(session.accessToken, playlistId)
    console.log('[tracks] fetching audio features for', tracks.length, 'tracks')

    const trackIds = tracks.map((t) => t.id).filter(Boolean)
    const features = await getAudioFeatures(session.accessToken, trackIds, tracks)

    const merged = mergeTracksWithFeatures(tracks, features, zones)
    const sorted = sortForWorkout(merged)

    return NextResponse.json({ tracks: sorted, zones })
  } catch (err: any) {
    console.error('[tracks] error:', err.message)

    if (err.message?.includes('403')) {
      return NextResponse.json({
        error: "Can't access this playlist. You can only sort playlists you own. To fix this: open Spotify → right-click the playlist → Add to profile (or Make a copy) → then sort your copy here.",
      }, { status: 403 })
    }

    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
