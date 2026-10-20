import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import { supabase, isCloudEnabled } from '@/lib/supabase'
import { startCloudSync, stopCloudSync, pullFromCloud } from '@/lib/cloudSync'

const HOME_KEY = 'petlink-home-owner'
const storedHome = () => (typeof localStorage !== 'undefined' ? localStorage.getItem(HOME_KEY) : null)
const setStoredHome = (v: string | null) => {
  if (typeof localStorage === 'undefined') return
  if (v) localStorage.setItem(HOME_KEY, v)
  else localStorage.removeItem(HOME_KEY)
}

type AuthState = {
  ready: boolean
  user: User | null
  syncing: boolean
  error: string | null
  recovery: boolean
  /** 当前查看/同步的家庭 owner；null 表示自己的家 */
  homeOwnerId: string | null
  init: () => void
  signUp: (email: string, password: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<boolean>
  updatePassword: (password: string) => Promise<boolean>
  joinHome: (ownerId: string) => Promise<boolean>
  leaveHome: () => Promise<void>
  setSyncing: (v: boolean) => void
}

/** 实际同步的 app_state 行归属者 */
function effectiveHomeId(user: User | null, homeOwnerId: string | null): string | null {
  if (!user) return null
  return homeOwnerId || user.id
}

/** 把 Supabase 英文错误转成更清楚的中文提示 */
function friendlyAuthError(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('invalid login credentials')) return '邮箱或密码错误。请确认两端用同一账号；旧版本/其它环境创建的账号可能无效，可直接重新注册。'
  if (m.includes('email not confirmed')) return '邮箱尚未验证，请查收验证邮件后再登录。'
  if (m.includes('user already registered') || m.includes('already registered')) return '该邮箱已注册，请直接登录。'
  if (m.includes('password should be at least')) return '密码至少 6 位。'
  if (m.includes('unable to validate email') || m.includes('invalid email')) return '邮箱格式不正确。'
  if (m.includes('rate limit') || m.includes('too many')) return '操作过于频繁，请稍后再试。'
  return msg
}

export const useAuth = create<AuthState>((set, get) => ({
  ready: !isCloudEnabled, // 未配置云端时视为已就绪（纯本地）
  user: null,
  syncing: false,
  error: null,
  recovery: false,
  homeOwnerId: storedHome(),

  init: () => {
    if (!supabase) {
      set({ ready: true })
      return
    }
    supabase.auth.getSession().then(async ({ data }) => {
      const user = data.session?.user ?? null
      set({ user, ready: true })
      const home = effectiveHomeId(user, get().homeOwnerId)
      if (user && home) {
        await pullFromCloud(home)
        startCloudSync(home)
      }
    })
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        set({ recovery: true })
        return
      }
      const user = session?.user ?? null
      const prev = get().user
      set({ user })
      const home = effectiveHomeId(user, get().homeOwnerId)
      if (user && home && user.id !== prev?.id) {
        set({ syncing: true })
        try {
          await pullFromCloud(home)
          startCloudSync(home)
        } finally {
          set({ syncing: false })
        }
      } else if (!user) {
        stopCloudSync()
        set({ syncing: false })
      }
    })
  },

  signUp: async (email, password) => {
    if (!supabase) return
    set({ error: null })
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) set({ error: friendlyAuthError(error.message) })
  },

  signIn: async (email, password) => {
    if (!supabase) return
    set({ error: null })
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) set({ error: friendlyAuthError(error.message) })
  },

  signOut: async () => {
    // 先清本地状态，保证 UI 立刻退出登录，即使网络请求卡住
    stopCloudSync()
    setStoredHome(null)
    set({ user: null, homeOwnerId: null, syncing: false, error: null })
    try {
      await supabase?.auth.signOut()
    } catch {
      /* 忽略：本地已退出 */
    }
  },

  resetPassword: async (email) => {
    if (!supabase || !email) return false
    set({ error: null })
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    if (error) {
      set({ error: error.message })
      return false
    }
    return true
  },

  updatePassword: async (password) => {
    if (!supabase) return false
    set({ error: null })
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      set({ error: error.message })
      return false
    }
    set({ recovery: false })
    return true
  },

  joinHome: async (ownerId) => {
    const { user } = get()
    if (!supabase || !user) return false
    const id = ownerId.trim()
    if (!id) return false
    if (id === user.id) {
      set({ error: '这是你自己的家庭 ID' })
      return false
    }
    const { error } = await supabase.from('home_members').upsert(
      { owner_id: id, member_id: user.id },
      { onConflict: 'owner_id,member_id' },
    )
    if (error) {
      set({ error: error.message })
      return false
    }
    setStoredHome(id)
    set({ homeOwnerId: id, syncing: true })
    stopCloudSync()
    try {
      await pullFromCloud(id)
      startCloudSync(id)
    } finally {
      set({ syncing: false })
    }
    return true
  },

  leaveHome: async () => {
    const { user, homeOwnerId } = get()
    if (!supabase || !user) return
    if (homeOwnerId && homeOwnerId !== user.id) {
      await supabase.from('home_members').delete().eq('owner_id', homeOwnerId).eq('member_id', user.id)
    }
    setStoredHome(null)
    set({ homeOwnerId: null, syncing: true })
    stopCloudSync()
    try {
      await pullFromCloud(user.id)
      startCloudSync(user.id)
    } finally {
      set({ syncing: false })
    }
  },

  setSyncing: (v) => set({ syncing: v }),
}))
