const BASE = 'https://api.spotify.com/v1'

async function spotifyFetch(path: string, accessToken: string, options?: RequestInit) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Spotify ${res.status} on ${path}: ${err.error?.message ?? res.statusText}`)
  }
  return res.json()
}

// Get an app-level token using Client Credentials (no user needed)
// This is used for reading public playlist data which avoids user token 403s
async function getClientToken(): Promise<string> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization:
        'Basic ' +
        Buffer.from(
          `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
        ).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  })
  const data = await res.json()
  if (!res.ok) throw new Error('Failed to get client token: ' + data.error)
  return data.access_token
}

// Fetch all user playlists (handles pagination)
export async function getUserPlaylists(accessToken: string) {
  const playlists: any[] = []
  let url = `/me/playlists?limit=50`

  while (url) {
    const data = await spotifyFetch(url, accessToken)
    playlists.push(...data.items)
    url = data.next ?? null
  }

  return playlists
}

// Fetch all tracks in a playlist using the user's access token
export async function getPlaylistTracks(accessToken: string, playlistId: string) {
  const tracks: any[] = []
  let url = `/playlists/${playlistId}/items?limit=100&market=PH`

  while (url) {
    const data = await spotifyFetch(url, accessToken)
    console.log('[tracks] raw item sample:', JSON.stringify(data.items?.[0]).slice(0, 400))
    const mapped = data.items
      .map((i: any) => i.item ?? i.track)
      .filter((t: any) => t && t.id && t.type === 'track')
      .map((t: any) => ({ ...t, previewUrl: t.preview_url ?? null }))
    console.log('[tracks] mapped', mapped.length, 'of', data.items?.length, 'items')
    tracks.push(...mapped)
    url = data.next ?? null
  }

  return tracks
}

// Fetch BPM using Deezer API — completely free, no API key required
export async function getAudioFeatures(accessToken: string, trackIds: string[], tracks?: any[]) {
  if (!tracks?.length) return trackIds.map(() => null)

  const features = await Promise.all(
    tracks.map(async (track) => {
      try {
        const artist = track.artists?.[0]?.name ?? ''
        const title = track.name ?? ''
        const query = encodeURIComponent(`${title} ${artist}`)

        // Step 1: Search Deezer for the track
        const searchRes = await fetch(
          `https://api.deezer.com/search/track?q=${query}&limit=1`
        )
        const searchData = await searchRes.json()
        const deezerTrackId = searchData?.data?.[0]?.id

        if (!deezerTrackId) {
          console.log('[deezer] no match for', title)
          return null
        }

        // Step 2: Get full track details which includes BPM
        const trackRes = await fetch(`https://api.deezer.com/track/${deezerTrackId}`)
        const trackData = await trackRes.json()
        const bpm = trackData?.bpm

        if (bpm && bpm > 0) {
          console.log('[deezer] BPM for', title, ':', bpm)
          return { id: track.id, tempo: Math.round(bpm), energy: 0.5 }
        }

        console.log('[deezer] no BPM for', title)
        return null
      } catch (e) {
        console.warn('[deezer] failed for', track.name, e)
        return null
      }
    })
  )

  return features
}

// Create a new playlist and add tracks
export async function savePlaylist(
  accessToken: string,
  userId: string,
  name: string,
  description: string,
  trackUris: string[]
) {
  // Create empty playlist
  const playlist = await spotifyFetch(`/me/playlists`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ name, description, public: false }),
  })

  // Add tracks in batches of 100
  for (let i = 0; i < trackUris.length; i += 100) {
    const chunk = trackUris.slice(i, i + 100)
    await spotifyFetch(`/playlists/${playlist.id}/items`, accessToken, {
      method: 'POST',
      body: JSON.stringify({ uris: chunk }),
    })
  }

  return playlist
}
