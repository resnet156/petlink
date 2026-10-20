import { useEffect } from 'react'
import { useStore } from '@/store/useStore'
import type { PageKey } from '@/store/useStore'
import { useAuth } from '@/store/useAuth'
import { useCollarConnection } from '@/store/useCollar'
import { isCloudEnabled } from '@/lib/supabase'
import { HomePage } from '@/pages/HomePage'
import { MapPage } from '@/pages/MapPage'
import { RecordsPage } from '@/pages/RecordsPage'
import { MePage } from '@/pages/MePage'
import { CollarPage } from '@/pages/CollarPage'
import { Toaster } from '@/components/Toaster'
import { TrailDrawer } from '@/components/TrailDrawer'
import { DemoPanel } from '@/components/DemoPanel'
import { MiniWidget } from '@/components/MiniWidget'
import { PwaManager } from '@/components/PwaManager'
import { AvatarPanel } from '@/modals/AvatarPanel'
import { CameraModal } from '@/modals/CameraModal'
import { MapBuilderModal } from '@/modals/MapBuilderModal'
import { FenceModal } from '@/modals/FenceModal'
import { LostModal } from '@/modals/LostModal'
import { ShareCardModal } from '@/modals/ShareCardModal'
import { VoiceModal } from '@/modals/VoiceModal'
import { ChatModal } from '@/modals/ChatModal'
import { AutomationModal } from '@/modals/AutomationModal'
import { DeviceModal } from '@/modals/DeviceModal'
import { DeviceControlModal } from '@/modals/DeviceControlModal'
import { EventModal, ActionModal, SoundModal, FriendsModal, LiveLocateModal } from '@/modals/MiscModals'
import { AuthModal } from '@/modals/AuthModal'
import { DesktopWidgetModal } from '@/modals/DesktopWidgetModal'
import { Icon, type IconName } from '@/components/Icon'

const NAV: { key: PageKey; icon: IconName; label: string }[] = [
  { key: 'home', icon: 'home', label: '首页' },
  { key: 'map', icon: 'map', label: '地图' },
  { key: 'records', icon: 'records', label: '记录' },
  { key: 'me', icon: 'me', label: '我的' },
]

export default function App() {
  useCollarConnection()
  const page = useStore((s) => s.page)
  const goPage = useStore((s) => s.goPage)
  const widgetMode = useStore((s) => s.widgetMode)
  const demoMode = useStore((s) => s.demoMode)
  const setDemoMode = useStore((s) => s.setDemoMode)
  const openModal = useStore((s) => s.openModal)
  const toast = useStore((s) => s.toast)
  const authUser = useAuth((s) => s.user)
  const authInit = useAuth((s) => s.init)
  const authRecovery = useAuth((s) => s.recovery)
  const authSyncing = useAuth((s) => s.syncing)

  useEffect(() => {
    authInit()
  }, [authInit])

  useEffect(() => {
    if (authRecovery) openModal('auth')
  }, [authRecovery, openModal])

  // 浮窗 / 桌面组件模式：仅渲染迷你地图（可运行时切换，与完整应用共享同一 store）
  if (widgetMode) {
    return <MiniWidget />
  }

  return (
    <div className="grid h-screen grid-cols-[92px_1fr] max-[1000px]:grid-cols-1">
      {/* 左侧导航 */}
      <aside className="z-30 flex flex-col items-center gap-4 border-r border-line bg-[rgba(250,252,249,.94)] px-3 py-4 max-[1000px]:fixed max-[1000px]:bottom-0 max-[1000px]:left-0 max-[1000px]:right-0 max-[1000px]:h-[72px] max-[1000px]:flex-row max-[1000px]:border-r-0 max-[1000px]:border-t max-[1000px]:z-[100]">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-teal text-xs font-extrabold leading-tight text-white shadow-soft max-[1000px]:hidden">
          pet<br />link
        </div>
        <nav className="mt-6 flex w-full flex-col gap-2.5 max-[1000px]:mt-0 max-[1000px]:flex-row max-[1000px]:justify-around">
          {NAV.map((n) => (
            <button
              key={n.key}
              data-testid={`nav-${n.key}`}
              onClick={() => goPage(n.key)}
              className={`flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-[11px] transition ${
                page === n.key ? 'bg-teal-soft font-bold text-teal' : 'text-[#91a09b] hover:bg-[#f0f5f2]'
              } max-[1000px]:flex-1`}
            >
              <Icon name={n.icon} size={22} />
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="flex-1 max-[1000px]:hidden" />
        <button
          className={`grid h-10 w-10 place-items-center rounded-xl border text-[#667773] max-[1000px]:hidden ${demoMode ? 'border-[#e0a53c] bg-[#fff3e0] text-[#a9731f]' : 'border-line bg-white/90'}`}
          data-testid="demo-mode-toggle"
          title={demoMode ? '演示模式已开启（点击退出）' : '开启演示模式'}
          onClick={() => setDemoMode(!demoMode)}
        >
          <Icon name="settings" size={18} />
        </button>
      </aside>

      {/* 主区域 */}
      <main className="h-screen overflow-auto px-8 pb-9 pt-6 max-[1000px]:px-4 max-[1000px]:pb-24">
        <div className="sticky top-0 z-10 flex h-16 items-center justify-between bg-gradient-to-b from-[rgba(238,243,239,.98)] to-transparent pb-3.5">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-teal text-white">🐾</div>
            <div><b className="text-lg">petlink</b><div className="text-xs text-muted">小度全屋宠物陪伴</div></div>
            {demoMode && (
              <span data-testid="demo-mode-badge" className="rounded-full border border-[#e8c98a] bg-[#fff3e0] px-2.5 py-1 text-[11px] font-bold text-[#a9731f]">● 演示模式</span>
            )}
          </div>
          <div className="flex gap-2.5">
            {page === 'collar' && <button className="btn btn-ghost h-10" onClick={() => goPage('home')}>返回首页</button>}
            <button className="relative grid h-10 w-10 place-items-center rounded-xl border border-line bg-white/90 text-[#667773]" data-testid="account-btn" title={authUser ? `已登录 ${authUser.email}·多设备云同步中` : isCloudEnabled ? '登录 / 云端同步' : '登录 / 云端同步（未配置）'} onClick={() => openModal('auth')}>
              <Icon name={authUser ? 'cloud' : 'login'} size={18} />
              {authUser && (
                <span
                  data-testid="cloud-sync-dot"
                  className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${authSyncing ? 'animate-pulse bg-[#e0a53c]' : 'bg-teal'}`}
                  aria-hidden
                />
              )}
            </button>
            <button className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-white/90 text-[#667773]" title="通知" onClick={() => toast('info', '没有新的异常通知')}>
              <Icon name="bell" size={18} />
            </button>
            <button className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-white/90 text-[#667773]" title="地图管理" onClick={() => openModal('mapBuilder')}>
              <Icon name="mapManage" size={18} />
            </button>
          </div>
        </div>

        {page === 'collar' && <CollarPage />}
        {page === 'home' && <HomePage />}
        {page === 'map' && <MapPage />}
        {page === 'records' && <RecordsPage />}
        {page === 'me' && <MePage />}
      </main>

      <TrailDrawer />
      <DemoPanel />
      <PwaManager />
      <Toaster />

      {/* 弹层 */}
      <AvatarPanel />
      <CameraModal />
      <MapBuilderModal />
      <FenceModal />
      <LostModal />
      <ShareCardModal />
      <VoiceModal />
      <ChatModal />
      <AutomationModal />
      <DeviceModal />
      <DeviceControlModal />
      <EventModal />
      <ActionModal />
      <SoundModal />
      <FriendsModal />
      <LiveLocateModal />
      <AuthModal />
      <DesktopWidgetModal />
    </div>
  )
}
