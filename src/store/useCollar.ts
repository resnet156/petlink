import { useEffect } from 'react'
import { create } from 'zustand'
import { activityToBehavior, liveActivity, parseLive, type CollarActivity, type CollarLive } from '@/domain/collar'
import { useStore } from './useStore'

const TOKEN_KEY = 'petlink-viewer-token'
function readToken() { try { return sessionStorage.getItem(TOKEN_KEY) || '' } catch { return '' } }
export const apiUrl = (path: string) => `${import.meta.env.BASE_URL}api/${path}`

type CollarState = {
  token: string
  live: CollarLive | null
  phase: 'locked' | 'connecting' | 'connected' | 'error'
  error: string
  activity: CollarActivity
  now: number
  health: { version: string; commit: string } | null
  connectionRevision: number
  setToken: (token: string) => void
}

export const useCollar = create<CollarState>((set) => ({
  token: readToken(), live: null, phase: 'locked', error: '', activity: 'unknown', now: Date.now(), health: null, connectionRevision: 0,
  setToken: (token) => {
    const clean = token.trim()
    try { if (clean) sessionStorage.setItem(TOKEN_KEY, clean); else sessionStorage.removeItem(TOKEN_KEY) } catch { /* Session may forbid storage; keep in memory. */ }
    set((state) => ({ token: clean, live: null, activity: 'unknown', error: '', phase: clean ? 'connecting' : 'locked', connectionRevision: state.connectionRevision + 1 }))
  },
}))

function syncPet(activity: CollarActivity, receivedAt?: number) {
  const store = useStore.getState()
  const behavior = activityToBehavior[activity]
  if (store.pet.behavior === behavior && (!receivedAt || store.pet.lastUpdatedAt === receivedAt)) return
  const pets = store.pets.map((pet) => pet.id === store.activePetId ? { ...pet, behavior, lastUpdatedAt: receivedAt ?? pet.lastUpdatedAt } : pet)
  // IMU describes motion only. Never change location, battery, feeding, or sleeping state.
  useStore.setState({ pets, pet: pets.find((pet) => pet.id === store.activePetId)! })
}

export function useCollarConnection() {
  const token = useCollar((s) => s.token)
  const connectionRevision = useCollar((s) => s.connectionRevision)
  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 7000)
    fetch(apiUrl('health'), { signal: controller.signal, cache: 'no-store' })
      .then(async (res) => { if (!res.ok) throw new Error(); return res.json() })
      .then((health) => { if (typeof health.version === 'string') useCollar.setState({ health }) })
      .catch(() => useCollar.setState({ health: null }))
    return () => { controller.abort(); clearTimeout(timeout) }
  }, [])

  useEffect(() => {
    let cancelled = false
    let timer = 0
    let controller: AbortController | null = null
    let requestTimeout = 0
    syncPet('unknown')
    if (!token) { useCollar.setState({ phase: 'locked', activity: 'unknown' }); return }
    useCollar.setState({ phase: 'connecting', error: '' })

    const poll = async () => {
      controller = new AbortController()
      requestTimeout = window.setTimeout(() => controller?.abort(), 7000)
      let retry = true
      let delay = 1000
      try {
        const response = await fetch(apiUrl('live'), { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store' })
        if (response.status === 401 || response.status === 403) { retry = false; throw new Error('访问令牌无效，请重新输入 Web 访问令牌') }
        if (!response.ok) throw new Error(`服务暂不可用（${response.status}）`)
        const live = parseLive(await response.json())
        if (cancelled) return
        const now = Date.now()
        const activity = liveActivity(live, now, true)
        useCollar.setState({ live, phase: 'connected', activity, error: '', now })
        syncPet(activity, activity === 'unknown' ? undefined : live.latest?.receivedAt)
      } catch (error) {
        if (cancelled) return
        useCollar.setState({ phase: 'error', activity: 'unknown', error: error instanceof Error && error.name !== 'AbortError' ? error.message : '连接超时，正在重试' })
        syncPet('unknown')
        delay = 3000
      } finally {
        clearTimeout(requestTimeout)
        if (!cancelled && retry) timer = window.setTimeout(poll, delay)
      }
    }
    void poll()
    const clock = window.setInterval(() => {
      const now = Date.now()
      const state = useCollar.getState()
      const activity = liveActivity(state.live, now, state.phase === 'connected')
      useCollar.setState({ now, activity })
      if (activity === 'unknown') syncPet('unknown')
    }, 1000)
    return () => { cancelled = true; clearTimeout(timer); clearTimeout(requestTimeout); clearInterval(clock); controller?.abort() }
  }, [token, connectionRevision])
}
