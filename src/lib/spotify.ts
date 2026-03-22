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
  let url = `/playlists/${playlistId}/items?limit=100`

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

// Fetch BPM using ReccoBeats API — free, uses Spotify track IDs directly
export async function getAudioFeatures(accessToken: string, trackIds: string[], tracks?: any[]) {
  if (!tracks?.length) return trackIds.map(() => null)

  const RECCO_KEY = process.env.RECCOBEATS_API_KEY

  const features = await Promise.all(
    tracks.map(async (track) => {
      try {
        const headers: Record<string, string> = {}
        if (RECCO_KEY) headers['Authorization'] = `Bearer ${RECCO_KEY}`

        const res = await fetch(
          `https://api.reccobeats.com/v1/track/${track.id}/audio-features`,
          { headers }
        )

        if (!res.ok) {
          console.log('[reccobeats] no data for', track.name, res.status)
          return null
        }

        const data = await res.json()
        const tempo = data?.tempo

        if (tempo && tempo > 0) {
          console.log('[reccobeats] BPM for', track.name, ':', Math.round(tempo))
          return { id: track.id, tempo: Math.round(tempo), energy: data.energy ?? 0.5 }
        }

        return null
      } catch (e) {
        console.warn('[reccobeats] failed for', track.name, e)
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
