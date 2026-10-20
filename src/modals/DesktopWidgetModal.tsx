import { useStore, currentRoom } from '@/store/useStore'
import { Modal } from '@/components/Modal'
import { Room3D } from '@/components/map/Room3D'
import { DESKTOP_RELEASE, detectOS, OS_LABEL, type DesktopOS } from '@/config/desktop'

const URL_OF: Record<DesktopOS, string> = {
  mac: DESKTOP_RELEASE.mac,
  win: DESKTOP_RELEASE.win,
  linux: DESKTOP_RELEASE.linux,
}

export function DesktopWidgetModal() {
  const open = useStore((s) => s.modal === 'desktopWidget')
  const close = useStore((s) => s.closeModal)
  const setWidgetMode = useStore((s) => s.setWidgetMode)
  const pet = useStore((s) => s.pet)
  const room = useStore(currentRoom)

  const os = detectOS()
  const ordered: DesktopOS[] = [os, ...(['mac', 'win', 'linux'] as DesktopOS[]).filter((o) => o !== os)]
  const published = DESKTOP_RELEASE.published

  const preview = () =>
    window.open(`${window.location.pathname}?mini=1`, 'petlink-mini', 'width=480,height=360,menubar=no,toolbar=no,location=no,status=no')

  // 把当前窗口切换成组件视图（与完整应用共享 store，位置天然同步）
  const switchToWidget = () => {
    close()
    setWidgetMode(true)
    const desktop = (window as unknown as { petlinkDesktop?: { collapse?: () => void } }).petlinkDesktop
    desktop?.collapse?.()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      wide
      eyebrow="DESKTOP WIDGET"
      title="桌面组件"
      desc="把宠物和它所在的 3D 房间作为桌面小组件常驻屏幕：无边框、可拖拽、始终置顶，宠物实时移动。"
      testId="desktop-widget-modal"
    >
      <div className="grid grid-cols-[1fr_300px] gap-5 max-[720px]:grid-cols-1">
        <div>
          <div className="rounded-2xl border border-line bg-[#eef3ef] p-3">
            <div className="relative h-[220px] w-full overflow-hidden rounded-xl">
              {room ? <Room3D room={room} pet={pet} style="cartoon" transparent showLabel={false} /> : <div className="grid h-full place-items-center text-sm text-muted">定位中…</div>}
            </div>
          </div>
          <p className="mt-2 text-center text-xs text-muted">这就是桌面组件的样子（纯 3D 房间 + 宠物，透明无边框）</p>
        </div>

        <div className="flex flex-col gap-3">
          {!published && (
            <div className="rounded-xl border border-[#e7d7a8] bg-[#fdf6e3] p-3 text-xs leading-relaxed text-[#8a6d2f]" data-testid="desktop-unpublished">
              安装包尚未发布。下方按钮暂时指向发布页；发布首个版本后将变为直接下载。
            </div>
          )}
          <div className="text-xs font-bold text-muted">下载安装（选择你的系统）</div>
          {ordered.map((o, i) => (
            <a
              key={o}
              href={published ? URL_OF[o] : DESKTOP_RELEASE.releasesPage}
              target="_blank"
              rel="noreferrer"
              data-testid={`desktop-dl-${o}`}
              className={`btn justify-between ${i === 0 ? 'btn-primary' : ''}`}
            >
              <span>{i === 0 ? '下载 · ' : ''}{OS_LABEL[o]}</span>
              <span aria-hidden>↓</span>
            </a>
          ))}
          <a href={DESKTOP_RELEASE.releasesPage} target="_blank" rel="noreferrer" className="text-center text-xs font-bold text-teal" data-testid="desktop-all-versions">
            查看所有版本 →
          </a>
          <button className="btn btn-primary" data-testid="switch-to-widget" onClick={switchToWidget}>
            切换到组件视图（本窗口）
          </button>
          <button className="btn" data-testid="desktop-preview" onClick={preview}>
            在新窗口预览浮窗
          </button>
          <p className="text-[11px] leading-relaxed text-muted">
            安装包未经签名。macOS 若提示「已损坏/无法打开」，把 app 拖进「应用程序」后，在「终端」执行一次
            <code className="mx-1 rounded bg-[#eef3ef] px-1">xattr -cr "/Applications/PetLink 桌面组件.app"</code>
            再打开即可（这是去掉下载隔离标记，不是真的损坏）。Windows 在 SmartScreen 选「仍要运行」。
          </p>
        </div>
      </div>
    </Modal>
  )
}
