import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// 云端后端（Supabase）。
// 为保证网页端 / PWA / 桌面组件(Electron) 三端都能云同步，这里内置公开的 URL + publishable(anon) key 作为默认值，
// 环境变量（Vercel / CI secrets）如存在则覆盖。publishable key 是前端公开密钥，由数据库 RLS 保护，可安全内置。
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://feugcwthpomqyxqdsjog.supabase.co'
const anonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || 'sb_publishable_nsZg8-zmmUV9aO8XeFUFoA_kzOxmYIO'

export const isCloudEnabled = import.meta.env.VITE_DISABLE_SUPABASE !== 'true' && Boolean(url && anonKey)

export const supabase: SupabaseClient | null = isCloudEnabled
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null

export const APP_STATE_TABLE = 'app_state'
