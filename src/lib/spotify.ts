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

// Fetch all tracks in a playlist using client credentials to avoid user token 403s
export async function getPlaylistTracks(accessToken: string, playlistId: string) {
  const tracks: any[] = []

  // Try with client credentials first (avoids Development mode restrictions)
  let token: string
  try {
    token = await getClientToken()
  } catch {
    // Fall back to user token
    token = accessToken
  }

  let url = `/playlists/${playlistId}/tracks?limit=100`

  while (url) {
    const data = await spotifyFetch(url, token)
    tracks.push(...data.items.map((i: any) => i.track).filter(Boolean))
    url = data.next ?? null
  }

  return tracks
}

// Fetch audio features (BPM, energy, etc.) for up to 100 tracks at once
export async function getAudioFeatures(accessToken: string, trackIds: string[]) {
  const features: any[] = []

  for (let i = 0; i < trackIds.length; i += 100) {
    const chunk = trackIds.slice(i, i + 100)
    try {
      const data = await spotifyFetch(
        `/audio-features?ids=${chunk.join(',')}`,
        accessToken
      )
      features.push(...(data.audio_features ?? []))
    } catch (err: any) {
      console.warn('[audio-features] failed:', err.message)
      // Push null placeholders so track indices still line up
      features.push(...chunk.map(() => null))
    }
  }

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
  const playlist = await spotifyFetch(`/users/${userId}/playlists`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ name, description, public: false }),
  })

  // Add tracks in batches of 100
  for (let i = 0; i < trackUris.length; i += 100) {
    const chunk = trackUris.slice(i, i + 100)
    await spotifyFetch(`/playlists/${playlist.id}/tracks`, accessToken, {
      method: 'POST',
      body: JSON.stringify({ uris: chunk }),
    })
  }

  return playlist
}
