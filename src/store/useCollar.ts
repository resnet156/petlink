import { useEffect } from 'react'
import { create } from 'zustand'
import { activityToBehavior, liveActivity, parseLive, type CollarActivity, type CollarLive } from '@/domain/collar'
import { useStore } from './useStore'
import { useAuth } from './useAuth'

const TOKEN_KEY = 'petlink-viewer-token'
const BINDING_KEY = 'petlink-collar-bindings-v1'
function readToken() { try { return sessionStorage.getItem(TOKEN_KEY) || '' } catch { return '' } }
export const apiUrl = (path: string) => `${import.meta.env.BASE_URL}api/${path}`

function bindingStorageKey() {
  const auth = useAuth.getState()
  if (!auth.ready) return ''
  const identity = auth.user ? `${auth.user.id}:${auth.homeOwnerId || auth.user.id}` : 'local'
  return `${BINDING_KEY}:${encodeURIComponent(identity)}`
}

function readBinding(deviceId: string) {
  const key = bindingStorageKey()
  if (!key || !deviceId) return null
  try {
    const record = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, unknown>
    return typeof record[deviceId] === 'string' ? record[deviceId] as string : null
  } catch { return null }
}

function saveBinding(deviceId: string, petId: string | null) {
  const key = bindingStorageKey()
  if (!key) return false
  try {
    const record = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, unknown>
    const next = record && typeof record === 'object' && !Array.isArray(record) ? record : {}
    if (petId) next[deviceId] = petId
    else delete next[deviceId]
    localStorage.setItem(key, JSON.stringify(next))
    return true
  } catch { return false }
}

type CollarState = {
  token: string
  live: CollarLive | null
  phase: 'locked' | 'connecting' | 'connected' | 'error'
  error: string
  activity: CollarActivity
  now: number
  health: { version: string; commit: string } | null
  boundPetId: string | null
  connectionRevision: number
  setToken: (token: string) => void
  bindPet: (petId: string | null) => void
}

export const useCollar = create<CollarState>((set) => ({
  token: readToken(), live: null, phase: 'locked', error: '', activity: 'unknown', now: Date.now(), health: null, boundPetId: null, connectionRevision: 0,
  setToken: (token) => {
    const clean = token.trim()
    const previous = useCollar.getState()
    if (previous.token && clean !== previous.token && previous.live?.device?.deviceId) applyCollarActivity(previous.live.device.deviceId, 'unknown')
    try { if (clean) sessionStorage.setItem(TOKEN_KEY, clean); else sessionStorage.removeItem(TOKEN_KEY) } catch { /* Session may forbid storage; keep in memory. */ }
    set((state) => ({ token: clean, live: null, activity: 'unknown', error: '', boundPetId: null, phase: clean ? 'connecting' : 'locked', connectionRevision: state.connectionRevision + 1 }))
  },
  bindPet: (petId) => {
    const state = useCollar.getState()
    const deviceId = state.live?.device?.deviceId
    if (!state.token || state.phase !== 'connected' || !deviceId) return
    if (petId && !useStore.getState().pets.some((pet) => pet.id === petId)) return
    if (!saveBinding(deviceId, petId)) return
    set({ boundPetId: petId })
    if (petId) {
      const activity = state.live?.latest?.deviceId === deviceId ? state.activity : 'unknown'
      applyCollarActivity(deviceId, activity, activity === 'unknown' ? undefined : state.live?.latest?.receivedAt)
    }
  },
}))

/** IMU may update only the pet explicitly paired with this device. */
export function applyCollarActivity(deviceId: string, activity: CollarActivity, receivedAt?: number) {
  const collar = useCollar.getState()
  if (!collar.token || !deviceId || collar.live?.device?.deviceId !== deviceId || !collar.boundPetId) return
  const store = useStore.getState()
  const bound = store.pets.find((pet) => pet.id === collar.boundPetId)
  if (!bound) return
  const behavior = activityToBehavior[activity]
  if (bound.behavior === behavior && (!receivedAt || bound.lastUpdatedAt === receivedAt)) return
  const pets = store.pets.map((pet) => pet.id === collar.boundPetId ? { ...pet, behavior, lastUpdatedAt: receivedAt ?? pet.lastUpdatedAt } : pet)
  // IMU describes motion only. Never change location, battery, feeding, or sleeping state.
  useStore.setState({ pets, pet: store.activePetId === collar.boundPetId ? pets.find((pet) => pet.id === collar.boundPetId)! : store.pet })
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
    if (!token) { useCollar.setState({ phase: 'locked', activity: 'unknown', boundPetId: null }); return }
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
        const activity = live.device?.deviceId && live.latest?.deviceId === live.device.deviceId ? liveActivity(live, now, true) : 'unknown'
        const boundPetId = live.device?.deviceId ? readBinding(live.device.deviceId) : null
        useCollar.setState({ live, phase: 'connected', activity, error: '', now, boundPetId })
        if (live.device?.deviceId) applyCollarActivity(live.device.deviceId, activity, activity === 'unknown' ? undefined : live.latest?.receivedAt)
      } catch (error) {
        if (cancelled) return
        useCollar.setState({ phase: 'error', activity: 'unknown', error: error instanceof Error && error.name !== 'AbortError' ? error.message : '连接超时，正在重试' })
        const state = useCollar.getState()
        if (state.live?.device?.deviceId) applyCollarActivity(state.live.device.deviceId, 'unknown')
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
      const activity = state.live?.device?.deviceId && state.live.latest?.deviceId === state.live.device.deviceId ? liveActivity(state.live, now, state.phase === 'connected') : 'unknown'
      useCollar.setState({ now, activity })
      if (activity === 'unknown' && state.live?.device?.deviceId) applyCollarActivity(state.live.device.deviceId, 'unknown')
    }, 1000)
    return () => { cancelled = true; clearTimeout(timer); clearTimeout(requestTimeout); clearInterval(clock); controller?.abort() }
  }, [token, connectionRevision])
}
