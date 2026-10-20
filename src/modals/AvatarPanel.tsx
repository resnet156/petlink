import { useStore, currentRoom } from '@/store/useStore'
import { Modal } from '@/components/Modal'
import { PetSvg } from '@/components/PetSvg'
import { behaviorLabel, roomDevices } from '@/lib/tracking'
import { relativeTime } from '@/lib/time'
import { deviceIconOf } from '@/components/map/furniture'
import { Icon, type IconName } from '@/components/Icon'

export function AvatarPanel() {
  const modal = useStore((s) => s.modal)
  const close = useStore((s) => s.closeModal)
  const pet = useStore((s) => s.pet)
  const pets = useStore((s) => s.pets)
  const activePetId = useStore((s) => s.activePetId)
  const setActivePet = useStore((s) => s.setActivePet)
  const addPet = useStore((s) => s.addPet)
  const removePet = useStore((s) => s.removePet)
  const renamePet = useStore((s) => s.renamePet)
  const room = useStore(currentRoom)
  const devices = useStore((s) => s.devices)
  const openCamera = useStore((s) => s.openCamera)
  const sendCommand = useStore((s) => s.sendCommand)
  const setTarget = useStore((s) => s.setDeviceControlTarget)

  const roomDevs = room ? roomDevices(devices, room.id) : []
  const speaker = roomDevs.find((d) => d.type === 'speaker')
  const feeder = devices.find((d) => d.type === 'feeder')

  const actions: { icon: IconName; label: string; onClick: () => void }[] = [
    { icon: 'peek', label: '看看它', onClick: () => openCamera() },
    { icon: 'call', label: '叫它', onClick: () => sendCommand(speaker?.id ?? feeder?.id ?? pet.id, `呼叫${pet.name}提示音`) },
    { icon: 'voice', label: '主人声音', onClick: () => sendCommand(speaker?.id ?? pet.id, '播放主人声音') },
    { icon: 'video', label: '视频互动', onClick: () => openCamera(true) },
    { icon: 'feed', label: '投喂', onClick: () => sendCommand(feeder?.id ?? pet.id, '远程投喂 8g') },
    { icon: 'play', label: '逗宠', onClick: () => sendCommand(pet.id, '启动逗宠模组') },
  ]

  return (
    <Modal open={modal === 'avatar'} onClose={close} eyebrow="PET AVATAR" title={pet.name} desc="切换/管理宠物，并展开位置、状态与互动能力。" testId="avatar-modal">
      {/* 多宠物切换与管理 */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5" data-testid="pet-manager">
        {pets.map((p) => (
          <button
            key={p.id}
            onClick={() => setActivePet(p.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
              p.id === activePetId ? 'border-teal bg-teal text-white' : 'border-line bg-white text-[#5d6e68]'
            }`}
          >
            {p.name}
          </button>
        ))}
        <button
          data-testid="add-pet"
          className="rounded-full border border-dashed border-teal-2 px-3 py-1.5 text-xs font-bold text-teal"
          onClick={() => {
            const name = prompt('新宠物名字？', `宠物 ${pets.length + 1}`)
            if (name !== null) addPet(name)
          }}
        >
          ＋ 添加宠物
        </button>
      </div>
      <div className="mb-3 flex items-center gap-2">
        <input
          className="field !py-1.5 text-xs"
          value={pet.name}
          aria-label="宠物名称"
          onChange={(e) => renamePet(pet.id, e.target.value)}
        />
        <button
          className="btn btn-red !py-1.5"
          disabled={pets.length <= 1}
          onClick={() => { if (confirm(`删除宠物「${pet.name}」？`)) removePet(pet.id) }}
        >
          删除
        </button>
      </div>
      <div className="grid grid-cols-[180px_1fr] gap-4 max-[640px]:grid-cols-1">
        <div className="grid min-h-[180px] place-items-center rounded-3xl bg-[#fff5e7]">
          <PetSvg behavior={pet.behavior} size={150} />
        </div>
        <div>
          <span className="badge">● 实时在线 · 项圈 {pet.collarBattery}%</span>
          <div className="my-3 grid grid-cols-3 gap-2">
            <Box b={room?.name ?? '定位中'} s="当前位置" />
            <Box b={behaviorLabel[pet.behavior]} s="当前状态" />
            <Box b={relativeTime(pet.lastUpdatedAt)} s="最近更新" />
          </div>
          <div className="text-xs text-muted">
            定位依据：{pet.trackingSources.includes('camera') ? `${room?.name}摄像头 + 项圈信号` : '项圈信号 + 最近摄像头辅助'} · {pet.trackingSources.includes('camera') ? '视觉已确认' : '辅助定位中'}
          </div>
          {room && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {roomDevs.map((d) => (
                <button key={d.id} className="badge" onClick={() => setTarget({ deviceId: d.id })}>
                  {deviceIconOf(d.type)} {d.name}
                </button>
              ))}
              {!roomDevs.length && <span className="text-xs text-muted">当前房间暂无绑定设备</span>}
            </div>
          )}
          <div className="mt-3.5 grid grid-cols-3 gap-2">
            {actions.map((a) => (
              <button
                key={a.label}
                onClick={a.onClick}
                className="flex flex-col items-center gap-1 rounded-xl border border-line bg-white px-2 py-3 text-center text-xs font-bold text-[#53645e] hover:border-[#cde3dc] hover:bg-teal-soft hover:text-teal"
              >
                <Icon name={a.icon} size={18} />
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}

function Box({ b, s }: { b: string; s: string }) {
  return (
    <div className="rounded-xl bg-[#f1f6f3] px-2.5 py-2.5">
      <b className="block text-[13px]">{b}</b>
      <span className="text-[12px] text-muted">{s}</span>
    </div>
  )
}
