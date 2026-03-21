import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { getZone, DEFAULT_ZONES, ZoneConfig } from '@/lib/bpm'

async function getBpmFromEssentia(previewUrl: string): Promise<number> {
  try {
    // Fetch the audio preview
    const audioRes = await fetch(previewUrl)
    if (!audioRes.ok) return 0
    const arrayBuffer = await audioRes.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Decode audio using audio-decode
    const decode = (await import('audio-decode')).default
    const audioBuffer = await decode(buffer)

    // Load Essentia WASM
    const { Essentia, EssentiaWASM } = await import('essentia.js')
    const essentia = new Essentia(EssentiaWASM)

    // Convert to mono vector
    const channelData = audioBuffer._channelData?.[0] ?? audioBuffer.getChannelData(0)
    const audioVector = essentia.arrayToVector(channelData)

    // Estimate BPM
    const result = essentia.PercivalBpmEstimator(audioVector)
    const bpm = Math.round(result.bpm)
    console.log('[essentia] analyzed BPM:', bpm)
    return bpm > 0 ? bpm : 0
  } catch (e: any) {
    console.warn('[essentia] analysis failed:', e.message)
    return 0
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const trackId = searchParams.get('trackId')
  const trackName = searchParams.get('trackName') ?? ''
  const trackArtist = searchParams.get('trackArtist') ?? ''

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

  let bpm = 0
  let previewUrl = ''

  // Step 1: Search Deezer — get stored BPM + preview URL in one shot
  try {
    const query = encodeURIComponent(`${trackName} ${trackArtist}`.trim())
    const searchRes = await fetch(`https://api.deezer.com/search/track?q=${query}&limit=1`)
    const searchData = await searchRes.json()
    const deezerTrack = searchData?.data?.[0]

    if (deezerTrack?.id) {
      const trackRes = await fetch(`https://api.deezer.com/track/${deezerTrack.id}`)
      const trackData = await trackRes.json()
      bpm = Math.round(trackData?.bpm ?? 0)
      previewUrl = trackData?.preview ?? deezerTrack?.preview ?? ''
      if (bpm > 0) console.log('[deezer] stored BPM for', trackName, ':', bpm)
    }
  } catch (e) {
    console.warn('[deezer] failed for', trackName)
  }

  // Step 2: If Deezer has no BPM but has a preview URL, analyze with Essentia.js
  if (!bpm && previewUrl) {
    console.log('[essentia] analyzing preview for', trackName)
    bpm = await getBpmFromEssentia(previewUrl)
  }

  console.log('[bpm] final for', trackName, ':', bpm)
  const zone = bpm > 0 ? getZone(bpm, zones) : 'unmatched'
  return NextResponse.json({ trackId, bpm, zone })
}
