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

// Fetch audio features (BPM, energy, etc.) for up to 100 tracks at once
// Fetch BPM using AudD API — free tier, no backlink required
export async function getAudioFeatures(accessToken: string, trackIds: string[], tracks?: any[]) {
  if (!tracks?.length) return trackIds.map(() => null)

  const AUDD_KEY = process.env.AUDD_API_KEY
  if (!AUDD_KEY) {
    console.warn('[audd] AUDD_API_KEY not set')
    return trackIds.map(() => null)
  }

  const features = await Promise.all(
    tracks.map(async (track) => {
      try {
        const artist = track.artists?.[0]?.name ?? ''
        const title = track.name ?? ''

        const res = await fetch('https://api.audd.io/findLyrics/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            api_token: AUDD_KEY,
            q: `${title} ${artist}`,
            return: 'spotify',
          }),
        })
        const data = await res.json()
        const spotifyData = data?.result?.[0]?.spotify

        if (spotifyData?.tempo) {
          return { id: track.id, tempo: Math.round(spotifyData.tempo), energy: spotifyData.energy ?? 0.5 }
        }

        // Fallback: try direct track lookup
        const res2 = await fetch('https://api.audd.io/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            api_token: AUDD_KEY,
            spotify_token: accessToken,
            spotify_track: track.id,
            return: 'spotify',
          }),
        })
        const data2 = await res2.json()
        const tempo = data2?.result?.spotify?.tempo ?? data2?.result?.deezer?.bpm

        if (tempo) {
          return { id: track.id, tempo: Math.round(tempo), energy: 0.5 }
        }

        return null
      } catch (e) {
        console.warn('[audd] failed for', track.name, e)
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
