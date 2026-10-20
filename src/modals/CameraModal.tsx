import { useStore, currentRoom, deviceById, camerasList } from '@/store/useStore'
import { Modal } from '@/components/Modal'
import { PetSvg } from '@/components/PetSvg'
import { cameraView } from '@/lib/status'

export function CameraModal() {
  const modal = useStore((s) => s.modal)
  const close = useStore((s) => s.closeModal)
  const pet = useStore((s) => s.pet)
  const room = useStore(currentRoom)
  const activeCameraId = useStore((s) => s.activeCameraId)
  const cam = useStore((s) => deviceById(s, activeCameraId))
  const cameras = useStore(camerasList)
  const setActiveCamera = useStore((s) => s.setActiveCamera)
  const handoff = useStore((s) => s.handoff)
  const sendCommand = useStore((s) => s.sendCommand)
  const toast = useStore((s) => s.toast)

  const camRoom = useStore((s) => s.homeMap.rooms.find((r) => r.id === cam?.roomId))
  const aligned = cam?.roomId === pet.roomId
  const view = cameraView(pet, cam, handoff)

  return (
    <Modal open={modal === 'camera'} onClose={close} wide eyebrow="DEMO CAMERA" title={cam ? cam.name : '暂无可用摄像头'} desc="示例画面：当前为演示视频源，未接入真实摄像头；宠物跨房间后可由下一台摄像头继续识别并接力。" testId="camera-modal">
      {handoff.phase !== 'idle' && (
        <div data-testid="handoff-banner" className="animate-pop mb-3 rounded-xl border border-[#d1e5de] bg-[#eaf5f1] px-3 py-2.5 text-[11px] leading-relaxed text-[#527067]">
          <b className="text-teal">摄像头接力</b>
          <br />
          {handoff.message}
        </div>
      )}
      <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-[22px] bg-gradient-to-br from-[#d9e4dc] via-[#c7d4cc] to-[#aebeb5]">
        <div className="absolute left-3.5 top-3.5 rounded-lg bg-[rgba(30,50,45,.72)] px-2.5 py-1.5 text-[11px] text-white">
          {view.badge}{view.showScene ? ` · ${camRoom?.name ?? '—'}` : ''}
        </div>
        {view.showScene ? (
          <div className="relative z-[2] grid place-items-center">
            <PetSvg behavior={pet.behavior} size={140} />
          </div>
        ) : (
          <div className="z-[2] text-sm text-[#4c5f59]">{view.kind === 'connecting' ? '画面连接中…' : view.kind === 'offline' ? '摄像头离线，请在下方切换其他设备' : '当前房间及附近暂无可用摄像头'}</div>
        )}
      </div>
      {view.showScene && !view.detected && (
        <div className="mt-1.5 text-[11px] text-[#a9731f]">当前画面未检测到{pet.name}，展示最近摄像头的示例画面</div>
      )}
      <div className="mt-1.5 text-[11px] text-muted">
        {cam
          ? aligned
            ? `${pet.name}位于${room?.name} · 当前画面与宠物位置一致`
            : `${pet.name}位于${room?.name} · 当前展示最近可用的${cam.name}画面`
          : `${pet.name}位于${room?.name} · 使用项圈信号持续定位`}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2.5">
        <div className="flex flex-wrap gap-1.5">
          {cameras.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setActiveCamera(c.id)
                toast('info', `已切换至${c.name}`)
              }}
              className={`rounded-xl border px-2.5 py-2 text-[11px] ${
                c.id === activeCameraId ? 'border-teal bg-teal text-white' : 'border-line bg-white'
              }`}
            >
              {c.name}
            </button>
          ))}
          {!cameras.length && <span className="text-xs text-muted">暂无已绑定摄像头</span>}
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={() => cam && sendCommand(cam.id, '播放主人声音')}>
            🔊 主人声音
          </button>
          <button className="btn btn-primary" onClick={() => sendCommand(cam?.id ?? pet.id, '发起视频互动')}>
            ▣ 视频互动
          </button>
        </div>
      </div>
    </Modal>
  )
}
