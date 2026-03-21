'use client'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Image from 'next/image'

interface Playlist {
  id: string
  name: string
  tracks: { total: number }
  images: { url: string }[]
  owner: { display_name: string }
}

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/playlists')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error)
        setPlaylists(d.playlists)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [status])

  if (status === 'loading' || loading) {
    return <LoadingScreen message="Loading your playlists..." />
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="flex items-center justify-between px-8 py-5 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#1DB954]" />
          <span className="font-semibold text-sm">Workout playlist builder</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-neutral-400 text-sm">{session?.user?.name}</span>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-8 py-10">
        <h2 className="text-xl font-semibold mb-1">Choose a playlist</h2>
        <p className="text-neutral-400 text-sm mb-8">
          Pick the playlist you want to sort by BPM.
        </p>

        {error && (
          <div className="bg-red-900/30 border border-red-800 text-red-300 text-sm px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {playlists.map((pl) => (
            <button
              key={pl.id}
              onClick={() => router.push(`/builder?playlistId=${pl.id}&name=${encodeURIComponent(pl.name)}`)}
              className="group text-left bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-600 rounded-xl p-3 transition-all"
            >
              <div className="aspect-square rounded-lg overflow-hidden bg-neutral-800 mb-3 relative">
                {pl.images?.[0] ? (
                  <Image
                    src={pl.images[0].url}
                    alt={pl.name}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-neutral-600">
                    <MusicIcon />
                  </div>
                )}
              </div>
              <p className="text-sm font-medium truncate">{pl.name}</p>
              <p className="text-xs text-neutral-500 mt-0.5">
                {pl.tracks.total} tracks
              </p>
            </button>
          ))}
        </div>
      </div>
    </main>
  )
}

function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-5 h-5 border-2 border-[#1DB954] border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-neutral-400 text-sm">{message}</p>
      </div>
    </div>
  )
}

function MusicIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
    </svg>
  )
}
