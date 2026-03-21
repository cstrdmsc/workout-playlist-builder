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
  const [search, setSearch] = useState('')

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

  const filtered = playlists.filter((pl) =>
    pl.name.toLowerCase().includes(search.toLowerCase())
  )

  if (status === 'loading' || loading) {
    return <LoadingScreen message="Loading your playlists..." />
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="flex items-center justify-between px-4 sm:px-8 py-5 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#1DB954]" />
          <span className="font-semibold text-sm">Workout playlist builder</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-neutral-400 text-sm hidden sm:block">{session?.user?.name}</span>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-semibold">Choose a playlist</h2>
            <p className="text-neutral-400 text-sm mt-0.5">
              {playlists.length} playlists found
            </p>
          </div>
          {/* Search bar */}
          <div className="relative w-full sm:w-64">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
            <input
              type="text"
              placeholder="Search playlists..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-700 rounded-full pl-9 pr-4 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-500 transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-800 text-red-300 text-sm px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {filtered.length === 0 && search && (
          <div className="text-center py-16">
            <p className="text-neutral-500 text-sm">No playlists matching "<span className="text-neutral-300">{search}</span>"</p>
            <button onClick={() => setSearch('')} className="text-xs text-neutral-600 hover:text-neutral-400 mt-2 transition-colors">Clear search</button>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filtered.map((pl) => (
            <button
              key={pl.id}
              onClick={() => router.push(`/builder?playlistId=${pl.id}&name=${encodeURIComponent(pl.name)}`)}
              className="group text-left bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-600 rounded-xl p-3 transition-all"
            >
              <div className="aspect-square rounded-lg overflow-hidden bg-neutral-800 mb-3 relative">
                {pl.images?.[0] ? (
                  <Image src={pl.images[0].url} alt={pl.name} fill className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-neutral-600">
                    <MusicIcon />
                  </div>
                )}
              </div>
              <p className="text-sm font-medium truncate">{pl.name}</p>
              <p className="text-xs text-neutral-500 mt-0.5">
                {(pl as any).tracks?.total ?? (pl as any).items?.total ?? '—'} tracks
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
