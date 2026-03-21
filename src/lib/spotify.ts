const BASE = 'https://api.spotify.com/v1'

async function spotifyFetch(path: string, accessToken: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message ?? `Spotify API error: ${res.status}`)
  }
  return res.json()
}

// Fetch all user playlists (handles pagination)
export async function getUserPlaylists(accessToken: string) {
  const playlists: any[] = []
  let url = `/me/playlists?limit=50`

  while (url) {
    const data = await spotifyFetch(url, accessToken)
    playlists.push(...data.items)
    url = data.next ? data.next.replace(BASE, '') : null
  }

  return playlists
}

// Fetch all tracks in a playlist
export async function getPlaylistTracks(accessToken: string, playlistId: string) {
  const tracks: any[] = []
  let url = `/playlists/${playlistId}/tracks?limit=100&fields=next,items(track(id,name,artists,album,duration_ms,preview_url))`

  while (url) {
    const data = await spotifyFetch(url, accessToken)
    tracks.push(...data.items.map((i: any) => i.track).filter(Boolean))
    url = data.next ? data.next.replace(BASE, '') : null
  }

  return tracks
}

// Fetch audio features (BPM, energy, etc.) for up to 100 tracks at once
export async function getAudioFeatures(accessToken: string, trackIds: string[]) {
  const features: any[] = []

  // Spotify allows max 100 IDs per request
  for (let i = 0; i < trackIds.length; i += 100) {
    const chunk = trackIds.slice(i, i + 100)
    const data = await spotifyFetch(
      `/audio-features?ids=${chunk.join(',')}`,
      accessToken
    )
    features.push(...(data.audio_features ?? []))
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
