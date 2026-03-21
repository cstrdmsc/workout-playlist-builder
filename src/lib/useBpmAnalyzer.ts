'use client'
import { useState, useCallback } from 'react'
import { TrackWithBpm, ZoneConfig, getZone } from './bpm'

export function useBpmAnalyzer() {
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState(0)

  const analyzeTracks = useCallback(async (
    tracks: TrackWithBpm[],
    zones: ZoneConfig,
    onUpdate: (updated: TrackWithBpm[]) => void
  ) => {
    const tracksWithPreview = tracks.filter((t: any) => t.previewUrl)
    if (!tracksWithPreview.length) return

    setAnalyzing(true)
    setProgress(0)

    const { createRealTimeBpmAnalyzer } = await import('realtime-bpm-analyzer')
    const updated = [...tracks]
    let done = 0

    await Promise.all(
      tracksWithPreview.map(async (track: any) => {
        try {
          const audioContext = new AudioContext()
          const analyzer = await createRealTimeBpmAnalyzer({
            continuousAnalysis: false,
            stabilizationTime: 2000,
          })

          const res = await fetch(track.previewUrl, { mode: 'cors' })
          const arrayBuffer = await res.arrayBuffer()
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

          const source = audioContext.createBufferSource()
          source.buffer = audioBuffer

          const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1)
          source.connect(scriptProcessor)
          scriptProcessor.connect(audioContext.destination)
          source.connect(analyzer.node)
          analyzer.node.connect(audioContext.destination)

          await new Promise<void>((resolve) => {
            analyzer.on('bpm', (data: any) => {
              const bpm = Math.round(data.bpm[0]?.tempo ?? 0)
              if (bpm > 0) {
                const idx = updated.findIndex((t) => t.id === track.id)
                if (idx !== -1) {
                  updated[idx] = {
                    ...updated[idx],
                    bpm,
                    zone: getZone(bpm, zones),
                  }
                  onUpdate([...updated])
                }
              }
              source.stop()
              audioContext.close()
              resolve()
            })

            source.start()
            setTimeout(() => {
              source.stop()
              audioContext.close()
              resolve()
            }, 5000)
          })
        } catch (e) {
          console.warn('BPM analysis failed for', track.name, e)
        }

        done++
        setProgress(Math.round((done / tracksWithPreview.length) * 100))
      })
    )

    setAnalyzing(false)
  }, [])

  return { analyzeTracks, analyzing, progress }
}
