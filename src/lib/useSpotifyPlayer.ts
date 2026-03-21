'use client'
import { useEffect, useState, useRef } from 'react'

declare global {
  interface Window {
    Spotify: any
    onSpotifyWebPlaybackSDKReady: () => void
  }
}

export function useSpotifyPlayer(accessToken: string | undefined) {
  const [deviceId, setDeviceId] = useState<string>('')
  const [isReady, setIsReady] = useState(false)
  const [isPaused, setIsPaused] = useState(true)
  const [currentTrackId, setCurrentTrackId] = useState<string>('')
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const playerRef = useRef<any>(null)
  const intervalRef = useRef<NodeJS.Timeout>()
  const deviceIdRef = useRef<string>('')
  const tokenRef = useRef<string>('')

  useEffect(() => { tokenRef.current = accessToken ?? '' }, [accessToken])
  useEffect(() => { deviceIdRef.current = deviceId }, [deviceId])

  function initPlayer(token: string) {
    if (!window.Spotify || playerRef.current) return
    console.log('[spotify] initializing player...')

    const spotifyPlayer = new window.Spotify.Player({
      name: 'Workout Playlist Builder',
      getOAuthToken: (cb: (t: string) => void) => cb(tokenRef.current || token),
      volume: 0.8,
    })

    spotifyPlayer.addListener('ready', ({ device_id }: { device_id: string }) => {
      console.log('[spotify] READY! device_id:', device_id)
      setDeviceId(device_id)
      deviceIdRef.current = device_id
      setIsReady(true)
    })

    spotifyPlayer.addListener('not_ready', () => setIsReady(false))
    spotifyPlayer.addListener('initialization_error', ({ message }: any) => console.error('[spotify] init error:', message))
    spotifyPlayer.addListener('authentication_error', ({ message }: any) => console.error('[spotify] auth error:', message))
    spotifyPlayer.addListener('account_error', ({ message }: any) => console.error('[spotify] Premium required:', message))

    spotifyPlayer.addListener('player_state_changed', (state: any) => {
      if (!state) return
      const newTrackId = state.track_window?.current_track?.id ?? ''
      setIsPaused(state.paused)
      setCurrentTrackId((prev) => {
        if (prev !== newTrackId) setPosition(0) // reset on track change
        return newTrackId
      })
      setPosition(state.position)
      setDuration(state.duration)
      clearInterval(intervalRef.current)
      if (!state.paused) {
        intervalRef.current = setInterval(async () => {
          const s = await spotifyPlayer.getCurrentState()
          if (s) setPosition(s.position)
        }, 500)
      }
    })

    spotifyPlayer.connect().then((success: boolean) => {
      console.log('[spotify] connect:', success ? 'OK' : 'FAILED')
    })

    playerRef.current = spotifyPlayer
  }

  useEffect(() => {
    if (!accessToken) return
    const token = accessToken

    if (window.Spotify) {
      initPlayer(token)
    } else {
      window.onSpotifyWebPlaybackSDKReady = () => {
        console.log('[spotify] SDK ready')
        initPlayer(token)
      }
      if (!document.getElementById('spotify-sdk')) {
        const script = document.createElement('script')
        script.id = 'spotify-sdk'
        script.src = 'https://sdk.scdn.co/spotify-player.js'
        script.async = true
        document.body.appendChild(script)
      }
    }

    return () => {
      clearInterval(intervalRef.current)
      if (playerRef.current) {
        playerRef.current.disconnect()
        playerRef.current = null
        setIsReady(false)
        setDeviceId('')
      }
    }
  }, [accessToken])

  // Play via server-side proxy to avoid 401s from expired browser tokens
  async function playTrack(trackId: string) {
    const dId = deviceIdRef.current
    if (!dId) {
      console.warn('[spotify] no device ID yet')
      return
    }
    console.log('[spotify] playing via proxy, device:', dId, 'track:', trackId)
    try {
      const res = await fetch('/api/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: dId, trackId }),
      })
      const data = await res.json()
      console.log('[spotify] proxy response:', data)
    } catch (e) {
      console.error('[spotify] proxy play failed:', e)
    }
  }

  async function togglePlay() {
    if (!playerRef.current) return
    await playerRef.current.togglePlay()
  }

  async function seek(positionMs: number) {
    if (!playerRef.current) return
    await playerRef.current.seek(positionMs)
    setPosition(positionMs)
  }

  return { isReady, isPaused, currentTrackId, position, duration, playTrack, togglePlay, seek }
}
