'use client'
import { useEffect, useState, useRef } from 'react'

declare global {
  interface Window {
    Spotify: any
    onSpotifyWebPlaybackSDKReady: () => void
  }
}

export function useSpotifyPlayer(accessToken: string | undefined) {
  const [player, setPlayer] = useState<any>(null)
  const [deviceId, setDeviceId] = useState<string>('')
  const [isReady, setIsReady] = useState(false)
  const [isPaused, setIsPaused] = useState(true)
  const [currentTrackId, setCurrentTrackId] = useState<string>('')
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const intervalRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    if (!accessToken) return

    // Load Spotify SDK script
    if (!document.getElementById('spotify-sdk')) {
      const script = document.createElement('script')
      script.id = 'spotify-sdk'
      script.src = 'https://sdk.scdn.co/spotify-player.js'
      script.async = true
      document.body.appendChild(script)
    }

    window.onSpotifyWebPlaybackSDKReady = () => {
      const spotifyPlayer = new window.Spotify.Player({
        name: 'Workout Playlist Builder',
        getOAuthToken: (cb: (token: string) => void) => cb(accessToken),
        volume: 0.8,
      })

      spotifyPlayer.addListener('ready', ({ device_id }: { device_id: string }) => {
        console.log('[spotify] player ready, device:', device_id)
        setDeviceId(device_id)
        setIsReady(true)
      })

      spotifyPlayer.addListener('not_ready', () => {
        setIsReady(false)
      })

      spotifyPlayer.addListener('player_state_changed', (state: any) => {
        if (!state) return
        setIsPaused(state.paused)
        setCurrentTrackId(state.track_window?.current_track?.id ?? '')
        setPosition(state.position)
        setDuration(state.duration)
        // Sync position from real state
        if (!state.paused) {
          clearInterval(intervalRef.current)
          intervalRef.current = setInterval(async () => {
            const s = await spotifyPlayer.getCurrentState()
            if (s) setPosition(s.position)
          }, 500)
        } else {
          clearInterval(intervalRef.current)
        }
      })

      spotifyPlayer.connect()
      setPlayer(spotifyPlayer)
    }

    return () => {
      if (player) player.disconnect()
      clearInterval(intervalRef.current)
    }
  }, [accessToken])

  async function playTrack(trackId: string) {
    if (!deviceId || !accessToken) return
    try {
      // Step 1: Transfer playback to our device first
      await fetch('https://api.spotify.com/v1/me/player', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ device_ids: [deviceId], play: false }),
      })

      // Small delay to let transfer complete
      await new Promise((r) => setTimeout(r, 500))

      // Step 2: Now play the track
      await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uris: [`spotify:track:${trackId}`] }),
      })
      setCurrentTrackId(trackId)
      setIsPaused(false)
    } catch (e) {
      console.error('[spotify] play failed:', e)
    }
  }

  async function togglePlay() {
    if (!player) return
    await player.togglePlay()
  }

  async function seek(positionMs: number) {
    if (!player) return
    await player.seek(positionMs)
    setPosition(positionMs)
  }

  return {
    isReady,
    isPaused,
    currentTrackId,
    position,
    duration,
    playTrack,
    togglePlay,
    seek,
  }
}
