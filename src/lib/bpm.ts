export type Zone = 'warmup' | 'peak' | 'cooldown' | 'unmatched'

export interface ZoneConfig {
  warmup: { min: number; max: number }
  peak: { min: number; max: number }
  cooldown: { min: number; max: number }
}

export const DEFAULT_ZONES: ZoneConfig = {
  warmup: { min: 90, max: 115 },
  peak: { min: 140, max: 175 },
  cooldown: { min: 70, max: 100 },
}

export interface TrackWithBpm {
  id: string
  name: string
  artists: { name: string }[]
  album: { name: string; images: { url: string }[] }
  duration_ms: number
  bpm: number
  energy: number
  zone: Zone
  previewUrl?: string
}

export function getZone(bpm: number, zones: ZoneConfig): Zone {
  if (bpm >= zones.warmup.min && bpm <= zones.warmup.max) return 'warmup'
  if (bpm >= zones.peak.min && bpm <= zones.peak.max) return 'peak'
  if (bpm >= zones.cooldown.min && bpm <= zones.cooldown.max) return 'cooldown'
  return 'unmatched'
}

export function mergeTracksWithFeatures(
  tracks: any[],
  features: any[],
  zones: ZoneConfig
): TrackWithBpm[] {
  const featureMap = new Map(features.map((f) => [f?.id, f]))

  return tracks
    .map((track) => {
      const feature = featureMap.get(track.id)
      if (!feature) return null

      const bpm = Math.round(feature.tempo)
      return {
        id: track.id,
        name: track.name,
        artists: track.artists,
        album: track.album,
        duration_ms: track.duration_ms,
        bpm,
        energy: feature.energy,
        zone: getZone(bpm, zones),
        previewUrl: track.preview_url ?? undefined,
      }
    })
    .filter(Boolean) as TrackWithBpm[]
}

// Sort tracks in workout order: warmup → peak → cooldown → unmatched
// Within each zone, sort by BPM ascending
export function sortForWorkout(tracks: TrackWithBpm[]): TrackWithBpm[] {
  const zoneOrder: Zone[] = ['warmup', 'peak', 'cooldown', 'unmatched']

  const grouped: Record<Zone, TrackWithBpm[]> = {
    warmup: [],
    peak: [],
    cooldown: [],
    unmatched: [],
  }

  for (const track of tracks) {
    grouped[track.zone].push(track)
  }

  // Within warmup: ascending BPM (gentle ramp up)
  grouped.warmup.sort((a, b) => a.bpm - b.bpm)
  // Within peak: descending energy (most intense first)
  grouped.peak.sort((a, b) => b.energy - a.energy)
  // Within cooldown: descending BPM (gradual wind-down)
  grouped.cooldown.sort((a, b) => b.bpm - a.bpm)

  return zoneOrder.flatMap((zone) => grouped[zone])
}

export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

export const ZONE_COLORS: Record<Zone, { bg: string; text: string; dot: string }> = {
  warmup: { bg: '#dbeafe', text: '#1d4ed8', dot: '#60a5fa' },
  peak: { bg: '#ffedd5', text: '#c2410c', dot: '#f97316' },
  cooldown: { bg: '#ede9fe', text: '#5b21b6', dot: '#a78bfa' },
  unmatched: { bg: '#f3f4f6', text: '#6b7280', dot: '#9ca3af' },
}
