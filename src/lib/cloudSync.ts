import { supabase, APP_STATE_TABLE } from '@/lib/supabase'
import { getSnapshot, applySnapshot, useStore } from '@/store/useStore'
import type { RealtimeChannel } from '@supabase/supabase-js'

// homeId = 被同步的 app_state 行归属者（owner）的 user_id。
// 个人默认 homeId = 自己的 uid；加入家庭后 homeId = 家庭 owner 的 uid（共享同一份数据）。
let unsubStore: (() => void) | null = null
let channel: RealtimeChannel | null = null
let debounceTimer: number | null = null
let applyingRemote = false
let localVersion = 0

export async function pullFromCloud(homeId: string): Promise<void> {
  if (!supabase) return
  try {
    const { data, error } = await supabase
      .from(APP_STATE_TABLE)
      .select('data, version')
      .eq('user_id', homeId)
      .maybeSingle()
    if (error) {
      console.warn('[cloudSync] pull failed:', error.message)
      return
    }
    if (data?.data) {
      applyingRemote = true
      try {
        applySnapshot(data.data as Partial<ReturnType<typeof getSnapshot>>)
        localVersion = data.version ?? 0
      } finally {
        applyingRemote = false
      }
    } else {
      await pushToCloud(homeId)
    }
  } catch (e) {
    // 任何异常都吞掉：避免云端数据异常导致登录/同步流程卡死
    console.warn('[cloudSync] pull error:', e)
  }
}

export async function pushToCloud(homeId: string): Promise<void> {
  if (!supabase) return
  localVersion += 1
  const { error } = await supabase.from(APP_STATE_TABLE).upsert(
    {
      user_id: homeId,
      data: getSnapshot(),
      version: localVersion,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  )
  if (error) console.warn('[cloudSync] push failed:', error.message)
}

export function startCloudSync(homeId: string): void {
  if (!supabase) return
  stopCloudSync()

  // 本地任何领域状态变化 → 防抖后推送云端
  unsubStore = useStore.subscribe(() => {
    if (applyingRemote) return
    if (debounceTimer) window.clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(() => void pushToCloud(homeId), 1500)
  })

  // 订阅同一家庭其它设备/成员的变更 → 实时拉取
  channel = supabase
    .channel(`app_state:${homeId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: APP_STATE_TABLE, filter: `user_id=eq.${homeId}` },
      (payload: { new?: { data?: unknown; version?: number } }) => {
        const row = payload.new
        if (!row?.data) return
        if ((row.version ?? 0) <= localVersion) return
        applyingRemote = true
        try {
          applySnapshot(row.data as Partial<ReturnType<typeof getSnapshot>>)
          localVersion = row.version ?? localVersion
        } catch (e) {
          console.warn('[cloudSync] apply remote error:', e)
        } finally {
          applyingRemote = false
        }
      },
    )
    .subscribe()
}

export function stopCloudSync(): void {
  if (unsubStore) {
    unsubStore()
    unsubStore = null
  }
  if (debounceTimer) {
    window.clearTimeout(debounceTimer)
    debounceTimer = null
  }
  if (channel && supabase) {
    void supabase.removeChannel(channel)
    channel = null
  }
}
