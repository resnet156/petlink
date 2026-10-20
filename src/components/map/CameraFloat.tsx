import { useRef, useState } from 'react'
import { GripVertical, X } from 'lucide-react'
import { useStore, currentRoom, deviceById, camerasList } from '@/store/useStore'
import { PetSvg } from '@/components/PetSvg'
import { cameraView } from '@/lib/status'

/** 地图上的摄像头观看浮窗（可拖动）。双击地图摄像头图标 / 宠物气泡“看看它”复用此浮窗。 */
export function CameraFloat() {
  const open = useStore((s) => s.cameraFloatOpen)
  const close = useStore((s) => s.closeCameraFloat)
  const pet = useStore((s) => s.pet)
  const room = useStore(currentRoom)
  const activeCameraId = useStore((s) => s.activeCameraId)
  const cam = useStore((s) => deviceById(s, activeCameraId))
  const cameras = useStore(camerasList)
  const setActiveCamera = useStore((s) => s.setActiveCamera)
  const sendCommand = useStore((s) => s.sendCommand)
  const toast = useStore((s) => s.toast)
  const handoff = useStore((s) => s.handoff)
  const camRoom = useStore((s) => s.homeMap.rooms.find((r) => r.id === cam?.roomId))

  const cardRef = useRef<HTMLDivElement>(null)
  const dragOff = useRef<{ dx: number; dy: number } | null>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  const startDrag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    const card = cardRef.current
    if (!card) return
    const rect = card.getBoundingClientRect()
    dragOff.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    const onMove = (ev: PointerEvent) => {
      const parent = card.offsetParent as HTMLElement | null
      if (!parent || !dragOff.current) return
      const pr = parent.getBoundingClientRect()
      const x = Math.max(8, Math.min(pr.width - card.offsetWidth - 8, ev.clientX - pr.left - dragOff.current.dx))
      const y = Math.max(8, Math.min(pr.height - 44, ev.clientY - pr.top - dragOff.current.dy))
      setPos({ x, y })
    }
    const onUp = () => {
      dragOff.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  if (!open) return null
  const view = cameraView(pet, cam, handoff)

  return (
    <div
      ref={cardRef}
      data-testid="camera-float"
      className={`app-no-drag animate-fade absolute z-[11] w-[320px] overflow-hidden rounded-[20px] border border-[#dce6e1] bg-white/96 shadow-soft backdrop-blur ${
        pos ? '' : 'left-6 top-6'
      }`}
      style={pos ? { left: pos.x, top: pos.y } : undefined}
    >
      <div className="flex cursor-move items-center justify-between px-3.5 py-2.5" onPointerDown={startDrag} title="拖动可移动">
        <b className="flex items-center gap-1 text-sm">
          <GripVertical size={14} className="text-[#b4c3bc]" />
          {cam ? cam.name : '暂无可用摄像头'}
        </b>
        <button
          data-testid="camera-float-close"
          aria-label="关闭"
          className="grid h-6 w-6 place-items-center rounded-lg text-[#8aa39b] hover:bg-[#eef3f0]"
          onClick={close}
        >
          <X size={16} />
        </button>
      </div>
      <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-gradient-to-br from-[#d9e4dc] via-[#c7d4cc] to-[#aebeb5]">
        <span className="absolute left-3 top-3 rounded-md bg-[rgba(30,50,45,.72)] px-2 py-1 text-[12px] font-bold text-white">
          {view.badge}{view.showScene ? ` · ${camRoom?.name ?? '—'}` : ''}
        </span>
        {view.showScene ? (
          <span className="relative z-[2]">
            <PetSvg behavior={pet.behavior} size={110} />
          </span>
        ) : (
          <span className="z-[2] px-6 text-center text-xs text-[#3f514b]">
            {view.kind === 'connecting' ? '画面连接中…' : view.kind === 'offline' ? '摄像头离线，请在下方切换其他设备' : '当前房间及附近暂无可用摄像头'}
          </span>
        )}
      </div>
      <div className="px-3.5 pb-3.5 pt-2.5">
        <div className="text-[11px] text-muted">
          {!cam
            ? `${pet.name}位于${room?.name} · 使用项圈信号持续定位`
            : view.detected
            ? `${pet.name}位于${room?.name} · 演示画面（示例，未接入真实摄像头）`
            : `${pet.name}位于${room?.name} · 当前${cam.name}画面未检测到${pet.name}（示例画面）`}
        </div>
        {cameras.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5" data-testid="camera-float-switch">
            {cameras.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setActiveCamera(c.id)
                  toast('info', `已切换至${c.name}`)
                }}
                className={`rounded-lg border px-2 py-1 text-[11px] ${
                  c.id === activeCameraId ? 'border-teal bg-teal text-white' : 'border-line bg-white text-[#5d6e68]'
                }`}
              >
                {c.name.replace(/摄像头$/, '') || c.name}
              </button>
            ))}
          </div>
        )}
        <div className="mt-2.5 flex gap-2">
          <button className="btn flex-1" onClick={() => cam && sendCommand(cam.id, '播放主人声音')}>
            🔊 主人声音
          </button>
          <button className="btn btn-primary flex-1" onClick={() => sendCommand(cam?.id ?? pet.id, '发起视频互动')}>
            ▣ 视频互动
          </button>
        </div>
      </div>
    </div>
  )
}
