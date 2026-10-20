import { useCallback, useEffect, useState } from 'react'
import { useStore, currentRoom } from '@/store/useStore'
import { useAuth } from '@/store/useAuth'
import { isCloudEnabled } from '@/lib/supabase'
import { Room3D } from '@/components/map/Room3D'
import { CameraFloat } from '@/components/map/CameraFloat'
import { AuthModal } from '@/modals/AuthModal'
import { Icon } from '@/components/Icon'
import { PetSvg } from '@/components/PetSvg'
import { PetScene, type PetModelInfo } from '@/components/collar/PetScene'
import { isPetAvatarUpdate, loadPetAvatarModel } from '@/lib/petAvatar'
import { usePetAvatarScope } from '@/lib/usePetAvatarScope'
import { useCollar } from '@/store/useCollar'
import type { CollarActivity } from '@/domain/collar'
import { behaviorBadge, behaviorColor, behaviorLabel } from '@/lib/tracking'

const behaviorAnimClass: Record<string, string> = {
  sleeping: 'pet-sleep',
  running: 'pet-run',
  playing: 'pet-play',
  eating: 'pet-eat',
}

/**
 * 桌面组件 / 浮窗模式（?mini=1 进入）：
 * 只渲染当前宠物所处房间的 3D 立体卡通形象 + 宠物，背景透明、无边框、无任何浏览器式 chrome。
 * 整个表面可拖拽（Electron 无边框窗口），关闭按钮仅在悬停时淡入。
 */
export function MiniWidget() {
  const pet = useStore((s) => s.pet)
  const room = useStore(currentRoom)
  const setMapMode = useStore((s) => s.setMapMode)
  const simulateNextRoom = useStore((s) => s.simulateNextRoom)
  const setWidgetMode = useStore((s) => s.setWidgetMode)
  const goPage = useStore((s) => s.goPage)
  const openCameraFloat = useStore((s) => s.openCameraFloat)
  const openModal = useStore((s) => s.openModal)
  const cloudUser = useAuth((s) => s.user)
  const token = useCollar((s) => s.token)
  const avatarScope = usePetAvatarScope(token)
  const modelScope = window.location.protocol === 'file:' ? '' : avatarScope
  const [avatarModel, setAvatarModel] = useState<{ scope: string; petId: string; data: ArrayBuffer } | null>(null)
  const [avatarReady, setAvatarReady] = useState(false)
  const [avatarFailed, setAvatarFailed] = useState(false)
  // An idle loop keeps a desktop pet alive while offline; the badge still reports
  // that there is no fresh collar motion, so this is not presented as telemetry.
  const avatarActivity: CollarActivity = pet.behavior === 'running' ? 'run' : pet.behavior === 'walking' ? 'walk' : pet.behavior === 'shaking' ? 'shake' : 'rest'
  const handleAvatarInfo = useCallback((info: PetModelInfo) => {
    if (info.error || (info.loaded && (!info.rigged || !info.clips.length))) { setAvatarFailed(true); setAvatarReady(false); return }
    if (info.loaded && info.rigged && info.clips.length) setAvatarReady(true)
  }, [])

  useEffect(() => {
    let active = true
    setAvatarModel(null)
    setAvatarReady(false)
    setAvatarFailed(false)
    const refresh = () => { void loadPetAvatarModel(modelScope, pet.id).then((saved) => {
      if (!active) return
      setAvatarModel(saved ? { scope: modelScope, petId: pet.id, data: saved.data } : null)
      setAvatarReady(false)
      setAvatarFailed(false)
    }).catch(() => { if (active) { setAvatarModel(null); setAvatarFailed(true) } }) }
    const onStorage = (event: StorageEvent) => { if (isPetAvatarUpdate(event, modelScope, pet.id)) refresh() }
    const onLocal = (event: Event) => { const detail = (event as CustomEvent<{ scope?: string; petId?: string }>).detail; if (modelScope && detail?.scope === modelScope && detail.petId === pet.id) refresh() }
    refresh()
    window.addEventListener('storage', onStorage)
    window.addEventListener('petlink:avatar-updated', onLocal)
    return () => { active = false; window.removeEventListener('storage', onStorage); window.removeEventListener('petlink:avatar-updated', onLocal) }
  }, [modelScope, pet.id])

  // 显示模式：room = 地图+宠物（3D 房间）；pet = 仅宠物形象（支持上传动图）。记忆到本机。
  const [view, setView] = useState<'room' | 'pet'>(() =>
    typeof localStorage !== 'undefined' && localStorage.getItem('petlink-widget-view') === 'pet' ? 'pet' : 'room',
  )
  const toggleView = () =>
    setView((v) => {
      const nv = v === 'room' ? 'pet' : 'room'
      try { localStorage.setItem('petlink-widget-view', nv) } catch { /* noop */ }
      return nv
    })

  useEffect(() => {
    setMapMode('live')
  }, [setMapMode])

  useEffect(() => {
    document.documentElement.classList.add('petlink-widget-mode')
    return () => document.documentElement.classList.remove('petlink-widget-mode')
  }, [])

  // 自动溜达：仅在未登录云同步时演示；登录后位置以云端真实/同步数据为准，避免多设备互相覆盖乱跳
  useEffect(() => {
    if (cloudUser) return
    const t = setInterval(() => simulateNextRoom(), 16000)
    return () => clearInterval(t)
  }, [simulateNextRoom, cloudUser])

  // 展开为完整应用：退出组件视图并进入完整地图（Electron 下把窗口放大为正常应用窗口）
  const expand = () => {
    setWidgetMode(false)
    goPage('map')
    const desktop = (window as unknown as { petlinkDesktop?: { expand?: () => void } }).petlinkDesktop
    desktop?.expand?.()
  }

  // 关闭 = 关闭地图/组件视图，回到完整应用本身（不退出整个程序）
  const exit = () => {
    // 脚本打开的预览浮窗（有 opener）→ 关掉这个临时窗口
    if (window.opener) {
      window.close()
      return
    }
    // Electron 主窗口 / 网页主窗口内切换过来的 → 退回完整应用，不关程序
    setWidgetMode(false)
    const desktop = (window as unknown as { petlinkDesktop?: { expand?: () => void } }).petlinkDesktop
    desktop?.expand?.()
  }

  // 退出整个桌面组件程序（仅桌面 App）
  const desktopApi = (window as unknown as { petlinkDesktop?: { quit?: () => void } }).petlinkDesktop
  const isDesktop = !!desktopApi
  const quit = () => desktopApi?.quit?.()

  return (
    <div className="group app-drag relative h-screen w-screen overflow-hidden bg-transparent" data-testid="mini-widget">
      {view === 'room' && room && (
        <div className="absolute inset-0" data-testid="mini-3d-room">
          <Room3D room={room} pet={pet} style="cartoon" transparent showLabel={false} />
        </div>
      )}
      {view === 'pet' && (
        <div className="absolute inset-0 grid place-items-center p-3" data-testid="mini-pet-only">
          <div className="relative grid h-full w-full place-items-center">
            {pet.photo ? (
              <img
                src={pet.photo}
                alt={pet.name}
                className={`max-h-[76vh] max-w-[86vw] object-contain drop-shadow-[0_14px_26px_rgba(40,60,55,.3)] ${avatarReady ? 'opacity-0' : ''} ${behaviorAnimClass[pet.behavior] ?? ''}`}
              />
            ) : (
              <div className={`grid h-[200px] w-[200px] place-items-center rounded-[32px] bg-[#fff8e9] shadow-soft ${avatarReady ? 'opacity-0' : ''} ${behaviorAnimClass[pet.behavior] ?? ''}`}>
                <PetSvg behavior={pet.behavior} size={176} />
              </div>
            )}
            {avatarModel?.scope === modelScope && avatarModel.petId === pet.id && !avatarFailed && <div className={`mini-avatar-scene absolute inset-0 ${avatarReady ? 'opacity-100' : 'opacity-0'}`} data-testid="mini-rigged-pet"><PetScene activity={avatarActivity} color="#c39459" room={null} model={avatarModel.data} stand={false} onModelInfo={handleAvatarInfo} /></div>}
            <span
              className="pointer-events-none absolute right-2 top-8 inline-flex items-center gap-1 rounded-full border-2 border-white bg-white px-2 py-0.5 text-[11px] font-bold shadow"
              style={{ color: behaviorColor[pet.behavior], boxShadow: `0 0 0 2px ${behaviorColor[pet.behavior]}` }}
            >
              {behaviorBadge[pet.behavior]} {behaviorLabel[pet.behavior]}
            </span>
            <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/70 bg-white/90 px-2.5 py-0.5 text-[12px] font-bold text-[#3f5a51] shadow-softsm">
              {pet.name}
            </span>
          </div>
        </div>
      )}
      {/* 控制：切换显示模式 · 账号/云同步 · 看摄像头 · 展开完整应用 · 关闭。
          常驻半透明（Electron 拖拽区域会吞掉 hover 事件，若依赖悬停则点不到），悬停更清晰 */}
      <div className="app-no-drag absolute right-2 top-2 flex gap-1.5 opacity-70 transition hover:opacity-100">
        <button
          data-testid="mini-mode-toggle"
          aria-label="切换显示模式"
          title={view === 'room' ? '切换为：仅宠物' : '切换为：地图+宠物'}
          onClick={toggleView}
          className="grid h-6 w-6 place-items-center rounded-full bg-black/35 text-[13px] text-white hover:bg-black/55"
        >
          {view === 'room' ? '🐾' : '🗺'}
        </button>
        <button
          data-testid="mini-account"
          aria-label="账号与云同步"
          title={cloudUser ? `已登录 ${cloudUser.email}·多设备云同步` : isCloudEnabled ? '登录以多设备同步' : '云端未配置（本机本地模式）'}
          onClick={() => openModal('auth')}
          className="relative grid h-6 w-6 place-items-center rounded-full bg-black/35 text-white hover:bg-black/55"
        >
          <Icon name={cloudUser ? 'cloud' : 'login'} size={13} />
          {cloudUser && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-white bg-teal" />}
        </button>
        <button
          data-testid="mini-camera"
          aria-label="查看当前房间摄像头画面"
          title="看当前房间摄像头"
          onClick={() => openCameraFloat()}
          className="grid h-6 w-6 place-items-center rounded-full bg-black/35 text-[13px] text-white hover:bg-black/55"
        >
          📷
        </button>
        <button
          data-testid="mini-expand"
          aria-label="展开完整应用"
          title="切换到完整应用"
          onClick={expand}
          className="grid h-6 w-6 place-items-center rounded-full bg-black/35 text-white hover:bg-black/55"
        >
          ⤢
        </button>
        <button
          data-testid="mini-exit"
          aria-label="关闭地图，返回应用"
          title="关闭，返回完整应用"
          onClick={exit}
          className="grid h-6 w-6 place-items-center rounded-full bg-black/35 text-white hover:bg-black/55"
        >
          ×
        </button>
        {isDesktop && (
          <button
            data-testid="mini-quit"
            aria-label="退出桌面组件程序"
            title="退出程序"
            onClick={quit}
            className="grid h-6 w-6 place-items-center rounded-full bg-black/35 text-[12px] text-white hover:bg-[#c0564e]"
          >
            ⏻
          </button>
        )}
      </div>

      {/* 未登录且已配置云端：底部常驻一个显眼的登录入口（解决"找不到登录入口"） */}
      {isCloudEnabled && !cloudUser && (
        <button
          data-testid="mini-login-hint"
          onClick={() => openModal('auth')}
          className="app-no-drag absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-bold text-white shadow hover:bg-black/65"
          title="登录同一账号即可与网页/其它设备同步"
        >
          <Icon name="login" size={12} /> 登录同步
        </button>
      )}

      {/* 浮层：摄像头画面 + 账号登录弹层。必须放在 no-drag 区域，
          否则 Electron 的拖拽区域会吞掉输入/点击，导致无法输入、无法关闭 */}
      <div className="app-no-drag">
        <CameraFloat />
        <AuthModal />
      </div>
    </div>
  )
}
