'use client'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import Image from 'next/image'
import {
  DndContext, closestCenter, KeyboardSensor,
  PointerSensor, useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TrackWithBpm, ZoneConfig, DEFAULT_ZONES, ZONE_COLORS, Zone, formatDuration } from '@/lib/bpm'
import { useSpotifyPlayer } from '@/lib/useSpotifyPlayer'

type TrackWithPreview = TrackWithBpm & { previewUrl?: string }

function BpmChart({ tracks, zones }: { tracks: TrackWithBpm[]; zones: ZoneConfig }) {
  if (tracks.length === 0) return null
  const MIN = 60, MAX = 220, BUCKETS = 32, bucketSize = (MAX - MIN) / BUCKETS
  const counts = Array(BUCKETS).fill(0)
  for (const t of tracks) {
    const idx = Math.min(Math.floor((t.bpm - MIN) / bucketSize), BUCKETS - 1)
    if (idx >= 0) counts[idx]++
  }
  const maxCount = Math.max(...counts, 1)
  const pct = (bpm: number) => ((bpm - MIN) / (MAX - MIN)) * 100

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
      <p className="text-xs font-medium text-neutral-500 uppercase tracking-widest mb-4">BPM distribution</p>
      <div className="relative h-20">
        {[
          { min: zones.warmup.min, max: zones.warmup.max, color: '#60a5fa18' },
          { min: zones.peak.min, max: zones.peak.max, color: '#f9731618' },
          { min: zones.cooldown.min, max: zones.cooldown.max, color: '#a78bfa18' },
        ].map(({ min, max, color }, i) => (
          <div key={i} className="absolute top-0 bottom-0 rounded"
            style={{ left: `${pct(min)}%`, width: `${pct(max) - pct(min)}%`, background: color }} />
        ))}
        <div className="absolute inset-0 flex items-end gap-px">
          {counts.map((count, i) => {
            const bpm = MIN + i * bucketSize + bucketSize / 2
            let color = '#3f3f46'
            if (bpm >= zones.warmup.min && bpm <= zones.warmup.max) color = '#60a5fa'
            else if (bpm >= zones.peak.min && bpm <= zones.peak.max) color = '#f97316'
            else if (bpm >= zones.cooldown.min && bpm <= zones.cooldown.max) color = '#a78bfa'
            return (
              <div key={i} className="flex-1 rounded-sm transition-all duration-300"
                style={{ height: `${(count / maxCount) * 100}%`, minHeight: count > 0 ? 3 : 0, background: color, opacity: count === 0 ? 0 : 1 }}
                title={`~${Math.round(bpm)} BPM: ${count} track${count !== 1 ? 's' : ''}`} />
            )
          })}
        </div>
      </div>
      <div className="flex justify-between mt-2">
        {[60, 100, 140, 180, 220].map((b) => (
          <span key={b} className="text-xs text-neutral-600">{b}</span>
        ))}
      </div>
      <div className="flex gap-4 mt-3 flex-wrap">
        {[['#60a5fa','Warmup'],['#f97316','Peak'],['#a78bfa','Cooldown'],['#3f3f46','Unmatched']].map(([color, label]) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-sm" style={{ background: color }} />
            <span className="text-xs text-neutral-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SpotifyPlayer({ track, accessToken, onClose, isReady, isPaused, currentTrackId, position, duration, playTrack, togglePlay, seek }: {
  track: TrackWithPreview
  accessToken: string
  onClose: () => void
  isReady: boolean
  isPaused: boolean
  currentTrackId: string
  position: number
  duration: number
  playTrack: (id: string) => void
  togglePlay: () => void
  seek: (ms: number) => void
}) {
  const colors = ZONE_COLORS[track.zone]
  const img = track.album.images?.[0]?.url
  const isPlaying = currentTrackId === track.id && !isPaused
  const progress = duration > 0 && currentTrackId === track.id ? (position / duration) * 100 : 0
  const elapsed = currentTrackId === track.id ? Math.floor(position / 1000) : 0
  const total = Math.floor(duration / 1000)

  function handlePlay() {
    if (currentTrackId === track.id) {
      togglePlay()
    } else {
      playTrack(track.id)
    }
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    if (!duration || currentTrackId !== track.id) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    seek(Math.floor(pct * duration))
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[520px] max-w-[calc(100vw-2rem)]">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg overflow-hidden relative bg-neutral-800 flex-shrink-0">
            {img && <Image src={img} alt={track.name} fill className="object-cover" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{track.name}</p>
            <p className="text-xs text-neutral-500 truncate">{track.artists.map((a: any) => a.name).join(', ')}</p>
          </div>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
            style={{ background: colors.bg + '33', color: colors.dot }}>{track.bpm} BPM</span>
          <button
            onClick={handlePlay}
            disabled={!isReady}
            className="w-9 h-9 rounded-full border border-neutral-700 flex items-center justify-center hover:bg-neutral-800 transition-colors disabled:opacity-30 flex-shrink-0"
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button onClick={onClose} className="text-neutral-500 hover:text-white transition-colors flex-shrink-0">
            <CloseIcon />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-neutral-600 w-8 text-right">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')}</span>
          <div className="flex-1 h-1 bg-neutral-800 rounded-full overflow-hidden cursor-pointer" onClick={handleSeek}>
            <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: colors.dot }} />
          </div>
          <span className="text-xs text-neutral-600 w-8">{Math.floor(total / 60)}:{String(total % 60).padStart(2, '0')}</span>
        </div>

        {!isReady && (
          <p className="text-xs text-neutral-500 mt-2 text-center">
            Connecting… make sure Spotify is open on any device first
          </p>
        )}
      </div>
    </div>
  )
}

function UnmatchedBanner({ count, included, onInclude, onExclude }: {
  count: number; included: boolean; onInclude: () => void; onExclude: () => void
}) {
  if (count === 0) return null
  return (
    <div className="flex items-center justify-between bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 gap-4">
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-2 h-2 rounded-full bg-neutral-500 flex-shrink-0" />
        <p className="text-sm text-neutral-300 truncate">
          <span className="font-medium text-white">{count} tracks</span> don't fit any zone
        </p>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <button onClick={onInclude}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${included ? 'bg-neutral-700 border-neutral-600 text-white' : 'border-neutral-700 text-neutral-500 hover:text-neutral-300'}`}>
          Include at end
        </button>
        <button onClick={onExclude}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${!included ? 'bg-neutral-700 border-neutral-600 text-white' : 'border-neutral-700 text-neutral-500 hover:text-neutral-300'}`}>
          Exclude
        </button>
      </div>
    </div>
  )
}

function SortableTrackRow({ track, index, isLoading, onPreview, onPlay }: {
  track: TrackWithPreview; index: number; isLoading?: boolean; onPreview: (t: TrackWithPreview) => void; onPlay: (t: TrackWithPreview) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: track.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }
  const colors = ZONE_COLORS[track.zone]
  const img = track.album.images?.[2]?.url ?? track.album.images?.[0]?.url

  return (
    <div ref={setNodeRef} style={style}
      className="flex items-center gap-3 px-4 py-3 border-b border-neutral-800 last:border-0 hover:bg-neutral-800/50 transition-colors group">
      <button {...attributes} {...listeners}
        className="text-neutral-700 group-hover:text-neutral-500 transition-colors cursor-grab active:cursor-grabbing flex-shrink-0"
        aria-label="Drag to reorder"><DragIcon /></button>
      <span className="text-xs text-neutral-600 w-5 text-right flex-shrink-0">{index}</span>
      <div className="w-9 h-9 rounded flex-shrink-0 relative overflow-hidden bg-neutral-800">
        {img && <Image src={img} alt={track.name} fill className="object-cover" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{track.name}</p>
        <p className="text-xs text-neutral-500 truncate">{track.artists.map((a: any) => a.name).join(', ')}</p>
      </div>
      <span className="text-xs text-neutral-500 flex-shrink-0 hidden sm:block">{formatDuration(track.duration_ms)}</span>
      {isLoading ? (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="w-3 h-3 border-2 border-neutral-600 border-t-[#1DB954] rounded-full animate-spin" />
          <span className="text-xs text-neutral-500">Detecting…</span>
        </div>
      ) : (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
          style={{ background: colors.bg + '33', color: colors.dot }}>{track.bpm} BPM</span>
      )}
      <span className="text-xs px-2 py-0.5 rounded-full capitalize flex-shrink-0 hidden sm:block"
        style={{ background: colors.bg + '22', color: colors.text + 'cc' }}>{track.zone}</span>
      <button onClick={() => onPlay(track)}
        className="opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity text-neutral-500 hover:text-white flex-shrink-0"
        aria-label="Play"><PlayIcon /></button>
    </div>
  )
}

function ZoneCard({ zone, config, count, onChange }: {
  zone: Zone; config: { min: number; max: number }; count: number; onChange: (min: number, max: number) => void
}) {
  const colors = ZONE_COLORS[zone]
  const labels = { warmup: 'Warmup', peak: 'Peak', cooldown: 'Cooldown' }
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full" style={{ background: colors.dot }} />
        <span className="text-sm font-medium">{labels[zone as keyof typeof labels]}</span>
      </div>
      <div className="space-y-2">
        <label className="text-xs text-neutral-500">BPM range</label>
        <div className="flex items-center gap-2">
          <input type="number" value={config.min} min={60} max={220}
            onChange={(e) => onChange(Number(e.target.value), config.max)}
            className="w-16 bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:border-neutral-500" />
          <span className="text-neutral-600 text-xs">–</span>
          <input type="number" value={config.max} min={60} max={220}
            onChange={(e) => onChange(config.min, Number(e.target.value))}
            className="w-16 bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:border-neutral-500" />
        </div>
      </div>
      <p className="text-xs text-neutral-500"><span className="text-white font-medium">{count}</span> tracks matched</p>
    </div>
  )
}

function DragIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
    <circle cx="4.5" cy="3.5" r="1.1"/><circle cx="9.5" cy="3.5" r="1.1"/>
    <circle cx="4.5" cy="7" r="1.1"/><circle cx="9.5" cy="7" r="1.1"/>
    <circle cx="4.5" cy="10.5" r="1.1"/><circle cx="9.5" cy="10.5" r="1.1"/>
  </svg>
}
function PlayIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
}
function PauseIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
}
function CloseIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
}

function BuilderContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useSearchParams()
  const playlistId = params.get('playlistId')
  const playlistName = params.get('name') ?? 'Playlist'

  const { isReady, isPaused, currentTrackId, position, duration, playTrack, togglePlay, seek } =
    useSpotifyPlayer(session?.accessToken)

  const [zones, setZones] = useState<ZoneConfig>(DEFAULT_ZONES)
  const [tracks, setTracks] = useState<TrackWithPreview[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedUrl, setSavedUrl] = useState('')
  const [error, setError] = useState('')
  const [activeFilter, setActiveFilter] = useState<Zone | 'all'>('all')
  const [includeUnmatched, setIncludeUnmatched] = useState(false)
  const [previewTrack, setPreviewTrack] = useState<TrackWithPreview | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeProgress, setAnalyzeProgress] = useState(0)
  const [analyzeDone, setAnalyzeDone] = useState(false)
  const [visibleCount, setVisibleCount] = useState(20)
  const [loadingTrackId, setLoadingTrackId] = useState<string>('')
  const [analyzedIds, setAnalyzedIds] = useState<Set<string>>(new Set())

  async function handleDetectBpm() {
    if (!playlistId || analyzing) return
    setAnalyzing(true)
    setAnalyzeProgress(0)
    setAnalyzedIds(new Set())

    const updated = [...tracks]
    let done = 0

    for (const track of tracks) {
      setLoadingTrackId(track.id)
      try {
        const q = new URLSearchParams({
          playlistId,
          warmupMin: String(zones.warmup.min), warmupMax: String(zones.warmup.max),
          peakMin: String(zones.peak.min), peakMax: String(zones.peak.max),
          cooldownMin: String(zones.cooldown.min), cooldownMax: String(zones.cooldown.max),
          trackId: track.id,
          trackName: track.name,
          trackArtist: track.artists?.[0]?.name ?? '',
          trackAlbum: track.album?.name ?? '',
        })
        const res = await fetch(`/api/bpm?${q}`)
        const data = await res.json()
        if (data.bpm > 0) {
          const idx = updated.findIndex((t) => t.id === track.id)
          if (idx !== -1) {
            updated[idx] = { ...updated[idx], bpm: data.bpm, zone: data.zone }
            setTracks([...updated])
          }
        }
      } catch (e) {
        console.warn('BPM fetch failed for', track.name)
      }
      // Mark this track as analyzed so it appears in the list
      setAnalyzedIds((prev) => new Set([...prev, track.id]))
      done++
      setAnalyzeProgress(Math.round((done / tracks.length) * 100))
    }

    setLoadingTrackId('')
    setAnalyzing(false)
    setAnalyzeDone(true)
    setTimeout(() => setAnalyzeDone(false), 4000)
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  const fetchTracks = useCallback(() => {
    if (!playlistId) return
    setLoading(true); setError('')
    const q = new URLSearchParams({
      playlistId,
      warmupMin: String(zones.warmup.min), warmupMax: String(zones.warmup.max),
      peakMin: String(zones.peak.min), peakMax: String(zones.peak.max),
      cooldownMin: String(zones.cooldown.min), cooldownMax: String(zones.cooldown.max),
    })
    fetch(`/api/tracks?${q}`)
      .then((r) => r.json())
      .then((d) => { if (d.error) throw new Error(d.error); setTracks(d.tracks) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [playlistId, zones])

  useEffect(() => { fetchTracks() }, [fetchTracks])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setTracks((prev) => arrayMove(prev, prev.findIndex((t) => t.id === active.id), prev.findIndex((t) => t.id === over.id)))
  }

  async function handleSave() {
    setSaving(true)
    try {
      // Save based on active tab
      const saveTracks = activeFilter === 'all'
        ? [...tracks]
            .filter((t) => t.zone !== 'unmatched' || includeUnmatched)
            .sort((a, b) => {
              const zoneDiff = zoneOrder[a.zone] - zoneOrder[b.zone]
              if (zoneDiff !== 0) return zoneDiff
              return a.bpm - b.bpm
            })
        : tracks
            .filter((t) => t.zone === activeFilter)
            .sort((a, b) => a.bpm - b.bpm)

      const nameMap: Record<string, string> = {
        all: `${playlistName} — BPM sorted`,
        warmup: `${playlistName} — Warmup`,
        peak: `${playlistName} — Peak`,
        cooldown: `${playlistName} — Cooldown`,
      }

      const descMap: Record<string, string> = {
        all: 'Full workout playlist sorted by BPM (Warmup → Peak → Cooldown)',
        warmup: `Warmup zone (${zones.warmup.min}–${zones.warmup.max} BPM)`,
        peak: `Peak zone (${zones.peak.min}–${zones.peak.max} BPM)`,
        cooldown: `Cooldown zone (${zones.cooldown.min}–${zones.cooldown.max} BPM)`,
      }

      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameMap[activeFilter],
          description: descMap[activeFilter],
          trackUris: saveTracks.map((t) => `spotify:track:${t.id}`),
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSavedUrl(data.playlist.external_urls?.spotify ?? '')
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  const unmatchedCount = tracks.filter((t) => t.zone === 'unmatched').length

  const zoneOrder: Record<string, number> = { warmup: 0, peak: 1, cooldown: 2, unmatched: 3 }

  const isAnalyzed = (id: string) => !analyzing && analyzedIds.size === 0 ? true : analyzedIds.has(id) || loadingTrackId === id

  const filtered = activeFilter === 'all'
    ? [...tracks]
        .filter((t) => isAnalyzed(t.id) && (t.zone !== 'unmatched' || includeUnmatched))
        .sort((a, b) => {
          const zoneDiff = zoneOrder[a.zone] - zoneOrder[b.zone]
          if (zoneDiff !== 0) return zoneDiff
          return a.bpm - b.bpm
        })
    : tracks
        .filter((t) => isAnalyzed(t.id) && t.zone === activeFilter)
        .sort((a, b) => a.bpm - b.bpm)
  const zoneCounts = {
    warmup: tracks.filter((t) => t.zone === 'warmup').length,
    peak: tracks.filter((t) => t.zone === 'peak').length,
    cooldown: tracks.filter((t) => t.zone === 'cooldown').length,
    unmatched: unmatchedCount,
  }

  return (
    <main className="min-h-screen bg-black text-white pb-32">

      {/* Success banner */}
      {savedUrl && (
        <div className="bg-[#1DB954] text-black px-5 py-2.5 flex items-center justify-between gap-4">
          <span className="text-xs font-medium">Playlist saved to your Spotify!</span>
          <div className="flex items-center gap-3 flex-shrink-0">
            <a
              href={savedUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setSavedUrl('')}
              className="text-xs font-semibold underline underline-offset-2 opacity-80 hover:opacity-100"
            >
              Open in Spotify ↗
            </a>
            <button
              onClick={() => setSavedUrl('')}
              className="text-black opacity-60 hover:opacity-100 transition-opacity text-sm font-bold leading-none"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <header className="flex items-center justify-between px-4 sm:px-8 py-4 border-b border-neutral-800 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => router.push('/dashboard')} className="text-neutral-500 hover:text-white transition-colors text-sm flex-shrink-0">← Back</button>
          <div className="w-px h-4 bg-neutral-700 flex-shrink-0" />
          <span className="text-sm font-medium truncate">{playlistName}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!loading && tracks.length > 0 && (
            <button
              onClick={handleDetectBpm}
              disabled={analyzing}
              className="flex items-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-white text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-full transition-colors border border-neutral-700"
            >
              {analyzing ? (
                <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /><span className="hidden sm:inline">Analyzing…</span> {analyzeProgress}%</>
              ) : <><span>⚡</span><span className="hidden sm:inline"> Detect BPM</span></>}
            </button>
          )}
          <button onClick={handleSave}
            disabled={saving || loading || analyzing || tracks.length === 0 || filtered.length === 0 || filtered.every((t) => t.bpm === 0)}
            className="bg-[#1DB954] hover:bg-[#1ed760] disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold text-xs sm:text-sm px-3 sm:px-5 py-2 rounded-full transition-colors">
            {saving ? 'Saving...' : activeFilter === 'all' ? 'Save all' : `Save ${activeFilter}`}
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        {error && <div className="bg-red-900/30 border border-red-800 text-red-300 text-sm px-4 py-3 rounded-lg">{error}</div>}

        <div>
          <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-widest mb-4">Workout zones</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(['warmup', 'peak', 'cooldown'] as const).map((zone) => (
              <ZoneCard key={zone} zone={zone} config={zones[zone]} count={zoneCounts[zone]}
                onChange={(min, max) => setZones((z) => ({ ...z, [zone]: { min, max } }))} />
            ))}
          </div>
        </div>

        {!loading && <BpmChart tracks={tracks} zones={zones} />}
        {!loading && <UnmatchedBanner count={unmatchedCount} included={includeUnmatched}
          onInclude={() => setIncludeUnmatched(true)} onExclude={() => setIncludeUnmatched(false)} />}

        {/* Onboarding tip — shows when tracks loaded but none have BPM yet */}
        {!loading && tracks.length > 0 && !analyzing && tracks.every((t) => t.bpm === 0) && (
          <div className="flex items-center gap-4 bg-neutral-900 border border-neutral-700 border-dashed rounded-xl px-5 py-4">
            <div className="text-2xl flex-shrink-0">⚡</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">Detect BPM to sort your tracks</p>
              <p className="text-xs text-neutral-500 mt-0.5">
                Click the <span className="text-white font-medium">⚡ Detect BPM</span> button in the top right to automatically analyze each track and sort them into Warmup, Peak, and Cooldown zones.
              </p>
            </div>
            <button
              onClick={handleDetectBpm}
              className="flex-shrink-0 bg-[#1DB954] hover:bg-[#1ed760] text-black font-semibold text-sm px-4 py-2 rounded-full transition-colors"
            >
              Detect BPM
            </button>
          </div>
        )}

        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-widest">
              Sorted tracklist · {filtered.length} tracks
            </h3>
            <div className="flex gap-1.5 flex-wrap">
              {(['all', 'warmup', 'peak', 'cooldown'] as const).map((f) => (
                <button key={f} onClick={() => { setActiveFilter(f); setVisibleCount(20) }}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors capitalize ${activeFilter === f ? 'bg-neutral-700 border-neutral-600 text-white' : 'border-neutral-800 text-neutral-500 hover:text-neutral-300'}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-5 h-5 border-2 border-[#1DB954] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
              {filtered.length === 0 ? (
                <p className="text-center text-neutral-500 text-sm py-12">No tracks in this zone.</p>
              ) : (
                <>
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={filtered.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                      {filtered.slice(0, visibleCount).map((track, i) => (
                        <SortableTrackRow
                          key={track.id}
                          track={track}
                          index={i + 1}
                          isLoading={loadingTrackId === track.id}
                          onPreview={setPreviewTrack}
                          onPlay={(t) => {
                            setPreviewTrack(t)
                            setTimeout(() => playTrack(t.id), 100)
                          }}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                  {/* Currently analyzing row */}
                  {analyzing && loadingTrackId && (() => {
                    const t = tracks.find((t) => t.id === loadingTrackId)
                    if (!t) return null
                    const img = t.album.images?.[2]?.url ?? t.album.images?.[0]?.url
                    return (
                      <div className="flex items-center gap-3 px-4 py-3 border-t border-neutral-800 bg-neutral-800/30">
                        <div className="w-4 h-4 flex-shrink-0" />
                        <span className="text-xs text-neutral-600 w-5 text-right flex-shrink-0">···</span>
                        <div className="w-9 h-9 rounded flex-shrink-0 relative overflow-hidden bg-neutral-800">
                          {img && <img src={img} alt={t.name} className="w-full h-full object-cover" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate text-neutral-400">{t.name}</p>
                          <p className="text-xs text-neutral-600 truncate">{t.artists.map((a: any) => a.name).join(', ')}</p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <div className="w-3 h-3 border-2 border-neutral-600 border-t-[#1DB954] rounded-full animate-spin" />
                          <span className="text-xs text-neutral-500">Detecting…</span>
                        </div>
                      </div>
                    )
                  })()}
                    <button
                      onClick={() => setVisibleCount((v) => v + 20)}
                      className="w-full py-3 text-xs text-neutral-500 hover:text-neutral-300 transition-colors border-t border-neutral-800"
                    >
                      Show {Math.min(20, filtered.length - visibleCount)} more of {filtered.length - visibleCount} remaining
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Analysis done toast */}
      {analyzeDone && (
        <div className="fixed bottom-6 right-6 z-50 bg-neutral-800 border border-neutral-700 text-white px-4 py-3 rounded-xl flex items-center gap-3 shadow-xl">
          <div className="w-2 h-2 rounded-full bg-[#1DB954] flex-shrink-0" />
          <span className="text-xs font-medium">BPM detection complete!</span>
          <button onClick={() => setAnalyzeDone(false)} className="text-neutral-500 hover:text-white ml-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>
      )}

      {previewTrack && (
        <SpotifyPlayer
          track={previewTrack}
          accessToken={session?.accessToken ?? ''}
          onClose={() => setPreviewTrack(null)}
          isReady={isReady}
          isPaused={isPaused}
          currentTrackId={currentTrackId}
          position={position}
          duration={duration}
          playTrack={playTrack}
          togglePlay={togglePlay}
          seek={seek}
        />
      )}

      <footer className="text-center py-6">
        <p className="text-xs text-neutral-700">
          BPM data powered by{' '}
          <a href="https://deezer.com" target="_blank" rel="noopener noreferrer" className="hover:text-neutral-500 underline">Deezer</a>
          {' '}and{' '}
          <a href="https://essentia.upf.edu" target="_blank" rel="noopener noreferrer" className="hover:text-neutral-500 underline">Essentia</a>
        </p>
      </footer>
    </main>
  )
}

export default function BuilderPage() {
  return <Suspense><BuilderContent /></Suspense>
}
