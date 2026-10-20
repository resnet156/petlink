import { useStore, currentRoom } from '@/store/useStore'
import { Modal } from '@/components/Modal'
import { MAP_W, MAP_H, roomCentroid } from '@/domain/geometry'
import { timeHM } from '@/lib/time'

export function EventModal() {
  const open = useStore((s) => s.modal === 'event')
  const close = useStore((s) => s.closeModal)
  const ev = useStore((s) => s.selectedEvent)
  const device = useStore((s) => s.devices.find((d) => d.id === ev?.deviceId))
  const openCamera = useStore((s) => s.openCamera)
  if (!ev) return null
  return (
    <Modal open={open} onClose={close} title={ev.title} eyebrow={timeHM(ev.timestamp)} desc={ev.detail} testId="event-modal">
      <div className="flex h-56 items-center justify-center rounded-2xl bg-[repeating-linear-gradient(45deg,#eef3ef,#eef3ef_8px,#f9fbf9_8px,#f9fbf9_16px)] text-sm text-[#81908a]">
        {ev.media ? (ev.media.type === 'video' ? '▶ 对应时间点视频片段' : '📷 对应时间点摄像头截图') : '该事件无媒体记录'}
      </div>
      <div className="mt-3 grid grid-cols-[110px_1fr] gap-2 border-b border-[#edf2ef] py-2 text-xs"><span className="text-muted">设备</span><b>{device?.name ?? '多设备融合'}</b></div>
      <div className="grid grid-cols-[110px_1fr] gap-2 py-2 text-xs"><span className="text-muted">识别方式</span><b>{(ev.source ?? ['camera', 'ble']).join(' + ')}</b></div>
      <div className="mt-3 flex gap-2">
        <button className="btn btn-primary" onClick={() => openCamera()}>打开实时画面</button>
      </div>
    </Modal>
  )
}

const ACTIONS = [
  { ico: '💤', t: '睡觉 12.6h', p: '最长连续睡眠 6h28m' },
  { ico: '🍽', t: '进食 2 次', p: '共记录约 36g' },
  { ico: '💧', t: '喝水 6 次', p: '集中于上午与傍晚' },
  { ico: '🧶', t: '玩耍 31m', p: '今日活跃度正常' },
  { ico: '🐾', t: '跑动 52m', p: '客厅为主要活动区' },
  { ico: '◫', t: '如厕 3 次', p: '事件来自区域识别' },
]
export function ActionModal() {
  const open = useStore((s) => s.modal === 'action')
  const close = useStore((s) => s.closeModal)
  return (
    <Modal open={open} onClose={close} title="动作识别" eyebrow="ACTION RECOGNITION" desc="来自摄像头、项圈传感与设备事件的行为汇总（演示数据）。" testId="action-modal">
      <div className="grid grid-cols-2 gap-3">
        {ACTIONS.map((a) => (
          <div key={a.t} className="rounded-2xl border border-line bg-white p-4">
            <div className="text-2xl">{a.ico}</div>
            <h4 className="my-1 text-base font-bold">{a.t}</h4>
            <p className="m-0 text-xs text-muted">{a.p}</p>
          </div>
        ))}
      </div>
    </Modal>
  )
}

export function SoundModal() {
  const open = useStore((s) => s.modal === 'sound')
  const close = useStore((s) => s.closeModal)
  const toast = useStore((s) => s.toast)
  return (
    <Modal open={open} onClose={close} title="声音识别" eyebrow="SOUND RECOGNITION" desc="原型仅展示叫声、呼噜等基础分类（mock）。" testId="sound-modal">
      {[{ t: '10:21 连续叫声', p: '持续 12 秒 · 客厅智能屏拾音' }, { t: '12:06 呼噜', p: '持续 4 分钟 · 卧室摄像头麦克风' }].map((s) => (
        <div key={s.t} className="mb-2 flex items-start gap-3 rounded-2xl border border-[#e5ece7] bg-[#f4f8f5] p-4">
          <div className="mt-1.5 h-2 w-2 rounded-full bg-teal-2" />
          <div>
            <b className="text-sm">{s.t}</b>
            <p className="mt-1 text-xs text-muted">{s.p}</p>
            <button className="btn mt-2" onClick={() => toast('info', '播放声音片段：模拟音频')}>▶ 播放</button>
          </div>
        </div>
      ))}
    </Modal>
  )
}

export function FriendsModal() {
  const open = useStore((s) => s.modal === 'friends')
  const close = useStore((s) => s.closeModal)
  const toast = useStore((s) => s.toast)
  const friends = [{ f: '🐶', n: 'Niko', d: '金毛 · 300m' }, { f: '🐱', n: '奶糖', d: '英短 · 420m' }, { f: '🐕', n: 'Lucky', d: '柯基 · 680m' }]
  return (
    <Modal open={open} onClose={close} wide title="毛茸茸的朋友" eyebrow="FURRY FRIENDS" desc="好友默认关闭位置共享，仅在双方同意后开放联系。" testId="friends-modal">
      <div className="grid grid-cols-3 gap-3 max-[640px]:grid-cols-1">
        {friends.map((x) => (
          <div key={x.n} className="rounded-2xl border border-line bg-white p-4 text-center">
            <div className="mx-auto grid h-[74px] w-[74px] place-items-center rounded-full bg-[#fff0dc] text-4xl">{x.f}</div>
            <b className="mt-2.5 block">{x.n}</b>
            <small className="text-muted">{x.d}</small>
            <div className="mt-2.5 flex justify-center gap-1.5">
              <button className="btn btn-primary" onClick={() => toast('success', '已发送好友申请')}>加好友</button>
              <button className="btn" onClick={() => toast('info', `正在向 ${x.n} 主人发起联系`)}>联系主人</button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}

export function LiveLocateModal() {
  const open = useStore((s) => s.modal === 'liveLocate')
  const close = useStore((s) => s.closeModal)
  const rooms = useStore((s) => s.homeMap.rooms)
  const pet = useStore((s) => s.pet)
  const room = useStore(currentRoom)
  const c = room ? roomCentroid(room) : { x: 500, y: 300 }
  return (
    <Modal open={open} onClose={close} title="实时定位" eyebrow="LIVE LOCATION" desc="走失模式下持续更新的项圈定位视图。" testId="live-locate-modal">
      <div className="relative h-[360px] overflow-hidden rounded-[22px] border border-line bg-[#f4f7f4]">
        <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          {rooms.map((r) => (
            <polygon key={r.id} points={r.polygon.map((p) => `${p.x},${p.y}`).join(' ')} fill="rgba(255,255,255,.9)" stroke="#c7d4ce" strokeWidth={4} style={{ vectorEffect: 'non-scaling-stroke' }} />
          ))}
          <circle cx={c.x} cy={c.y} r={40} fill="rgba(76,160,146,.15)" />
          <circle cx={c.x} cy={c.y} r={18} fill="#fff3d8" stroke="#2e7f75" strokeWidth={5} />
          <text x={c.x} y={c.y + 6} fontSize={22} textAnchor="middle">🐱</text>
        </svg>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-xl bg-[#f1f6f3] py-2.5"><b className="block text-sm">{room?.name}</b><span className="text-muted">当前位置</span></div>
        <div className="rounded-xl bg-[#f1f6f3] py-2.5"><b className="block text-sm">{Math.round(pet.confidence * 100)}%</b><span className="text-muted">置信度</span></div>
        <div className="rounded-xl bg-[#f1f6f3] py-2.5"><b className="block text-sm">{pet.collarBattery}%</b><span className="text-muted">项圈电量</span></div>
      </div>
    </Modal>
  )
}
