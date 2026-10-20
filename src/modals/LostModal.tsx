import { useEffect, useRef } from 'react'
import { useStore, currentRoom } from '@/store/useStore'
import { Modal } from '@/components/Modal'
import { drawShareCard } from '@/lib/shareCard'
import { relativeTime } from '@/lib/time'

export function LostModal() {
  const open = useStore((s) => s.modal === 'lost')
  const close = useStore((s) => s.closeModal)
  const pet = useStore((s) => s.pet)
  const lost = useStore((s) => s.lost)
  const room = useStore(currentRoom)
  const setLost = useStore((s) => s.setLost)
  const openModal = useStore((s) => s.openModal)
  const sendCommand = useStore((s) => s.sendCommand)
  const toast = useStore((s) => s.toast)
  const miniRef = useRef<HTMLCanvasElement>(null)

  const lastRoom = useStore((s) => s.homeMap.rooms.find((r) => r.id === lost.lastRoomId)?.name) ?? room?.name ?? '家附近'

  useEffect(() => {
    if (open && miniRef.current)
      drawShareCard(miniRef.current, {
        name: pet.name,
        species: pet.species,
        furColor: pet.furColor,
        collarColor: pet.collarColor,
        photo: pet.photo,
        lastRoom,
        lastSeen: lost.lastUpdatedAt ? relativeTime(lost.lastUpdatedAt) : '刚刚',
      })
  }, [open, pet.name, pet.species, pet.furColor, pet.collarColor, pet.photo, lastRoom, lost.lastUpdatedAt])

  return (
    <Modal open={open} onClose={close} wide title="走失互寻" eyebrow="LOST MODE" desc="可关闭。开启后持续共享定位，并向附近宠友发布寻宠动态。" testId="lost-modal">
      <div className="grid grid-cols-2 gap-4 max-[640px]:grid-cols-1">
        <div className="rounded-3xl bg-gradient-to-br from-[#7d3c39] to-[#c45c56] p-5 text-white">
          <span className="badge badge-red bg-white text-[#a44945]">● 走失模式</span>
          <h2 className="my-3 text-2xl font-bold">{pet.name}最后定位：{lastRoom}</h2>
          <div className="text-xs opacity-80">
            {lost.lastUpdatedAt ? relativeTime(lost.lastUpdatedAt) : '刚刚更新'} · 项圈电量 {pet.collarBattery}%
          </div>
          <div className="mt-3.5 grid grid-cols-2 gap-2">
            <button className="rounded-xl border border-white/25 bg-white/15 p-2.5 font-bold" onClick={() => openModal('liveLocate')}>⌖ 查看实时定位</button>
            <button className="rounded-xl border border-white/25 bg-white/15 p-2.5 font-bold" onClick={() => toast('info', '已提醒附近宠友')}>◉ 提醒附近会员</button>
            <button className="rounded-xl border border-white/25 bg-white/15 p-2.5 font-bold" onClick={() => openModal('shareCard')}>↗ 分享寻宠卡片</button>
            <button className="rounded-xl border border-white/25 bg-white/15 p-2.5 font-bold" onClick={() => sendCommand(pet.id, '播放寻找声音到项圈 / 附近设备')}>🔊 播放寻找声音</button>
          </div>
        </div>
        <div className="card m-0">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-bold">寻宠卡片</h3>
            <span className="badge">图片示例</span>
          </div>
          <div className="flex justify-center rounded-[22px] bg-[#e6eeea] p-4">
            <canvas ref={miniRef} width={720} height={960} className="h-auto w-[min(320px,100%)] rounded-[22px] bg-white shadow-soft" />
          </div>
          <button className="btn mt-3 w-full" onClick={() => openModal('shareCard')}>放大预览 / 导出图片</button>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <button className="btn btn-red" onClick={() => setLost(true)}>开启走失模式</button>
        <button className="btn" onClick={() => setLost(false)}>退出走失模式</button>
      </div>
    </Modal>
  )
}
