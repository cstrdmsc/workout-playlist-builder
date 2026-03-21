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
  const tokenRef = useRef<string>('')

  // Keep token ref up to date
  useEffect(() => { tokenRef.current = accessToken ?? '' }, [accessToken])

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
      setIsReady(true)
    })

    spotifyPlayer.addListener('not_ready', ({ device_id }: { device_id: string }) => {
      console.warn('[spotify] NOT ready:', device_id)
      setIsReady(false)
    })

    spotifyPlayer.addListener('initialization_error', ({ message }: any) =>
      console.error('[spotify] init error:', message))

    spotifyPlayer.addListener('authentication_error', ({ message }: any) =>
      console.error('[spotify] auth error:', message))

    spotifyPlayer.addListener('account_error', ({ message }: any) =>
      console.error('[spotify] account error (Premium needed):', message))

    spotifyPlayer.addListener('player_state_changed', (state: any) => {
      if (!state) return
      setIsPaused(state.paused)
      setCurrentTrackId(state.track_window?.current_track?.id ?? '')
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
      console.log('[spotify] connect result:', success)
    })

    playerRef.current = spotifyPlayer
  }

  useEffect(() => {
    if (!accessToken) return

    const token = accessToken

    if (window.Spotify) {
      // SDK already loaded — init right away
      initPlayer(token)
    } else {
      // Set callback before loading script
      window.onSpotifyWebPlaybackSDKReady = () => {
        console.log('[spotify] SDK script ready')
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

  async function playTrack(trackId: string) {
    const token = tokenRef.current
    if (!deviceId || !token) {
      console.warn('[spotify] not ready — deviceId:', deviceId, 'token:', !!token)
      return
    }
    try {
      // Transfer playback to our device
      await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_ids: [deviceId], play: false }),
      })
      await new Promise((r) => setTimeout(r, 300))

      // Play the track
      const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uris: [`spotify:track:${trackId}`] }),
      })
      console.log('[spotify] play response:', res.status)
    } catch (e) {
      console.error('[spotify] play failed:', e)
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
