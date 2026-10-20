import { useEffect } from 'react'
import { useStore, currentRoom } from '@/store/useStore'
import { useAuth } from '@/store/useAuth'
import { isCloudEnabled } from '@/lib/supabase'
import { Room3D } from '@/components/map/Room3D'
import { CameraFloat } from '@/components/map/CameraFloat'
import { AuthModal } from '@/modals/AuthModal'
import { Icon } from '@/components/Icon'

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

  useEffect(() => {
    setMapMode('live')
  }, [setMapMode])

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
      {room && (
        <div className="absolute inset-0" data-testid="mini-3d-room">
          <Room3D room={room} pet={pet} style="cartoon" transparent showLabel={false} />
        </div>
      )}
      {/* 控制：账号/云同步 · 看摄像头 · 展开完整应用 · 关闭。
          常驻半透明（Electron 拖拽区域会吞掉 hover 事件，若依赖悬停则点不到），悬停更清晰 */}
      <div className="app-no-drag absolute right-2 top-2 flex gap-1.5 opacity-70 transition hover:opacity-100">
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
