import { useStore } from '@/store/useStore'
import type { PetBehavior } from '@/domain/types'

export const DEMO_ENABLED =
  import.meta.env.DEV || new URLSearchParams(window.location.search).get('demo') === '1'

const BEHAVIORS: { v: PetBehavior; label: string }[] = [
  { v: 'sleeping', label: '睡觉' }, { v: 'idle', label: '静止' }, { v: 'looking', label: '摇头/张望' },
  { v: 'running', label: '奔跑' }, { v: 'eating', label: '进食' }, { v: 'drinking', label: '喝水' },
  { v: 'playing', label: '玩耍' }, { v: 'litter', label: '如厕/停留' },
]
const ENVS: { v: string; label: string; t: number; h: number }[] = [
  { v: 'normal', label: '正常', t: 26.4, h: 56 }, { v: 'hot', label: '高温', t: 30.1, h: 68 },
  { v: 'humid', label: '高湿', t: 27.2, h: 78 }, { v: 'cold', label: '低温', t: 17.8, h: 51 },
]

export function DemoPanel() {
  const demoMode = useStore((s) => s.demoMode)
  const setDemoMode = useStore((s) => s.setDemoMode)
  const resetDemo = useStore((s) => s.resetDemo)
  const rooms = useStore((s) => s.homeMap.rooms)
  const pet = useStore((s) => s.pet)
  const moveToRoom = useStore((s) => s.moveToRoom)
  const setBehavior = useStore((s) => s.setBehavior)
  const setRoomEnvironment = useStore((s) => s.setRoomEnvironment)
  const triggerBell = useStore((s) => s.triggerBell)
  const triggerFenceAlert = useStore((s) => s.triggerFenceAlert)
  const simulateNextRoom = useStore((s) => s.simulateNextRoom)
  const openCamera = useStore((s) => s.openCamera)
  const triggerLowMood = useStore((s) => s.triggerLowMood)
  const setCompanionEnabled = useStore((s) => s.setCompanionEnabled)
  const companionEnabled = useStore((s) => s.companionEnabled)
  const toggleDrawer = useStore((s) => s.toggleDrawer)
  const addEvent = useStore((s) => s.addEvent)
  const toast = useStore((s) => s.toast)

  if (!demoMode) return null

  return (
    <div data-testid="demo-panel" className="fixed bottom-6 left-[108px] z-[90] w-[270px] rounded-[20px] bg-[rgba(28,49,44,.95)] p-4 text-white shadow-soft max-[1000px]:left-4 max-[1000px]:bottom-24">
      <div className="mb-2.5 flex items-center justify-between">
        <h4 className="font-bold">演示控制台</h4>
        <div className="flex gap-1.5">
          <button className="rounded-lg border border-white/20 px-2 py-1 text-[11px]" onClick={() => { resetDemo() }}>重置</button>
          <button className="rounded-lg border border-white/20 px-2 py-1 text-[11px]" onClick={() => setDemoMode(false)}>退出</button>
        </div>
      </div>
      <label className="mb-1 mt-2 block text-[12px] text-[#b8cac4]">宠物位置（触发真实跨房间）</label>
      <select data-testid="demo-room" className="w-full rounded-lg border border-white/15 bg-[#24483f] px-2.5 py-2 text-[11px]" value={pet.roomId} onChange={(e) => moveToRoom(e.target.value)}>
        {rooms.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
      </select>
      <label className="mb-1 mt-2.5 block text-[12px] text-[#b8cac4]">宠物状态</label>
      <select className="w-full rounded-lg border border-white/15 bg-[#24483f] px-2.5 py-2 text-[11px]" value={pet.behavior} onChange={(e) => setBehavior(e.target.value as PetBehavior)}>
        {BEHAVIORS.map((b) => (<option key={b.v} value={b.v}>{b.label}</option>))}
      </select>
      <label className="mb-1 mt-2.5 block text-[12px] text-[#b8cac4]">当前房间环境</label>
      <div className="grid grid-cols-2 gap-1.5">
        {ENVS.map((env) => (
          <button key={env.v} className="rounded-lg border border-white/15 bg-[#24483f] px-2 py-1.5 text-[11px]" onClick={() => setRoomEnvironment(pet.roomId, env.t, env.h)}>{env.label}</button>
        ))}
      </div>
      <label className="mb-1 mt-2.5 block text-[12px] text-[#b8cac4]">事件</label>
      <div className="grid grid-cols-2 gap-1.5">
        <button className="rounded-lg border border-white/15 bg-[#24483f] px-2 py-1.5 text-[11px]" onClick={triggerBell}>宠物找人</button>
        <button className="rounded-lg border border-white/15 bg-[#24483f] px-2 py-1.5 text-[11px]" onClick={triggerFenceAlert}>围栏告警</button>
        <button className="rounded-lg border border-white/15 bg-[#24483f] px-2 py-1.5 text-[11px]" onClick={() => { simulateNextRoom(); setTimeout(() => openCamera(), 1000) }}>摄像头接力</button>
        <button className="rounded-lg border border-white/15 bg-[#24483f] px-2 py-1.5 text-[11px]" onClick={() => { if (!companionEnabled) setCompanionEnabled(true); setTimeout(triggerLowMood, 60) }}>情绪偏低</button>
        <button className="rounded-lg border border-white/15 bg-[#24483f] px-2 py-1.5 text-[11px]" onClick={() => addEvent({ type: 'eat', title: '进食', detail: '喂食器事件 · 18g', roomId: pet.roomId })}>进食</button>
        <button className="rounded-lg border border-white/15 bg-[#24483f] px-2 py-1.5 text-[11px]" onClick={() => addEvent({ type: 'sound', title: '声音事件', detail: '识别到连续叫声 12 秒', roomId: pet.roomId })}>声音事件</button>
        <button className="col-span-2 rounded-lg border border-white/15 bg-[#24483f] px-2 py-1.5 text-[11px]" onClick={() => { toggleDrawer(true); toast('info', '已打开踪迹') }}>打开踪迹</button>
      </div>
    </div>
  )
}
