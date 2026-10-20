import { useEffect, useState } from 'react'
import { useAuth } from '@/store/useAuth'

/** Never share generated avatar cache between Supabase accounts or viewer tokens. */
export function usePetAvatarScope(viewerToken: string) {
  const ready = useAuth((state) => state.ready)
  const userId = useAuth((state) => state.user?.id || '')
  const homeOwnerId = useAuth((state) => state.homeOwnerId || '')
  const [viewer, setViewer] = useState<{ token: string; scope: string } | null>(null)

  useEffect(() => {
    if (!ready || userId || !viewerToken || typeof crypto === 'undefined' || !crypto.subtle) return
    let active = true
    void crypto.subtle.digest('SHA-256', new TextEncoder().encode(viewerToken)).then((digest) => {
      if (active) setViewer({ token: viewerToken, scope: `viewer:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}` })
    }).catch(() => { if (active) setViewer(null) })
    return () => { active = false }
  }, [ready, userId, viewerToken])

  if (!ready) return ''
  if (userId) return `user:${userId}:home:${homeOwnerId || userId}`
  return viewer?.token === viewerToken ? viewer.scope : ''
}
