import { useState } from 'react'
import { useStore, deviceById } from '@/store/useStore'
import { Modal } from '@/components/Modal'
import { deviceIconOf } from '@/components/map/furniture'

const PORTIONS = [6, 8, 12]

export function DeviceControlModal() {
  const open = useStore((s) => s.modal === 'deviceControl')
  const target = useStore((s) => s.deviceControlTarget)
  const dev = useStore((s) => deviceById(s, target?.deviceId))
  const room = useStore((s) => s.homeMap.rooms.find((r) => r.id === dev?.roomId))
  const close = useStore((s) => s.setDeviceControlTarget)
  const updateDevice = useStore((s) => s.updateDevice)
  const execDevice = useStore((s) => s.execDevice)
  const feed = useStore((s) => s.feed)
  const openCamera = useStore((s) => s.openCamera)
  const setActiveCamera = useStore((s) => s.setActiveCamera)
  const openModal = useStore((s) => s.openModal)
  const deviceOp = useStore((s) => s.deviceOp)
  const [portion, setPortion] = useState(8)

  if (!dev) return null
  const st = dev.status
  const offline = !dev.online
  const op = deviceOp && deviceOp.deviceId === dev.id ? deviceOp : null

  return (
    <Modal open={open} onClose={() => close(null)} title={dev.name} eyebrow="DEVICE CONTROL" desc={`${room?.name ?? ''} · ${dev.online ? '在线' : '离线'} · 指令反馈区分“已发送 / 执行成功 / 失败”`} testId="device-control-modal">
      <div className="flex items-center gap-4 rounded-[22px] border border-[#dbe8e2] bg-gradient-to-br from-[#e9f4ef] to-[#f8fbf9] p-4">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white text-2xl shadow-softsm">{deviceIconOf(dev.type)}</div>
        <div>
          <b>{dev.name}</b>
          <div className="mt-1 text-xs text-muted">房间：{room?.name ?? '未分配'}</div>
          <span className={`badge mt-2 ${dev.online ? '' : 'badge-red'}`}>● {dev.online ? '在线' : '离线'}</span>
        </div>
      </div>

      {/* 统一操作状态反馈 */}
      {op && (
        <div
          data-testid="device-op"
          className={`mt-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${
            op.phase === 'success'
              ? 'border-[#cfe6dc] bg-[#eaf6f0] text-teal'
              : op.phase === 'sending'
              ? 'border-[#d9e2dd] bg-[#f1f5f3] text-[#5d726a]'
              : 'border-[#f0cfca] bg-[#fdeeec] text-[#b5564e]'
          }`}
        >
          <span>{op.phase === 'sending' ? '⟳' : op.phase === 'success' ? '✓' : '✕'}</span>
          <span>{op.message}</span>
        </div>
      )}
      {offline && (
        <div className="mt-3 rounded-xl border border-[#f0cfca] bg-[#fdeeec] px-3 py-2 text-xs text-[#b5564e]">
          设备离线，控制指令将不会发送。请检查设备电源 / 网络后重试。
        </div>
      )}

      <div className="mt-3.5 rounded-2xl border border-line bg-white p-4">
        {dev.type === 'camera' && (
          <>
            <h4 className="mb-3 text-sm font-bold">实时画面与识别</h4>
            <div className="flex gap-2">
              <button className="btn btn-primary" disabled={offline} onClick={() => { setActiveCamera(dev.id); close(null); openModal('camera') }}>打开实时画面</button>
              <button className="btn" disabled={offline} onClick={() => execDevice(dev.id, '调取最近宠物录像片段')}>最近宠物片段</button>
            </div>
          </>
        )}
        {dev.type === 'speaker' && (
          <>
            <h4 className="mb-3 text-sm font-bold">声音控制</h4>
            <Range label="音量" value={Number(st.volume ?? 48)} onChange={(v) => updateDevice(dev.id, { status: { ...st, volume: v } })} />
            <div className="mt-3 flex gap-2">
              <button className="btn btn-primary" disabled={offline} onClick={() => execDevice(dev.id, '播放主人声音')}>播放主人声音</button>
              <button className="btn" disabled={offline} onClick={() => execDevice(dev.id, '播放呼叫宠物提示音')}>播放呼叫音</button>
            </div>
          </>
        )}
        {dev.type === 'smart_screen' && (
          <>
            <h4 className="mb-3 text-sm font-bold">智能屏互动</h4>
            <Range label="屏幕亮度" value={Number(st.brightness ?? 65)} onChange={(v) => updateDevice(dev.id, { status: { ...st, brightness: v } })} />
            <div className="mt-3 flex gap-2">
              <button className="btn btn-primary" disabled={offline} onClick={() => execDevice(dev.id, '发起视频互动')}>发起视频互动</button>
              <button className="btn" disabled={offline} onClick={() => openCamera()}>查看所在房间</button>
            </div>
          </>
        )}
        {dev.type === 'feeder' && (
          <>
            <h4 className="mb-3 text-sm font-bold">远程投喂</h4>
            <div className="flex items-center justify-between py-1.5 text-xs"><span>余粮</span><b>{String(st.food ?? 68)}%</b></div>
            <div className="flex items-center justify-between py-1.5 text-xs"><span>上次投喂</span><b>{String(st.lastPortion ?? 18)}g</b></div>
            <div className="mt-2 text-xs text-muted">确认投喂量</div>
            <div className="mt-1.5 flex gap-2" data-testid="feed-portions">
              {PORTIONS.map((g) => (
                <button
                  key={g}
                  onClick={() => setPortion(g)}
                  className={`flex-1 rounded-xl border py-2 text-sm font-bold ${portion === g ? 'border-teal bg-teal text-white' : 'border-line bg-white text-[#53645e]'}`}
                >
                  {g}g
                </button>
              ))}
            </div>
            <button
              className="btn btn-primary mt-3 w-full"
              data-testid="feed-confirm"
              disabled={offline || op?.phase === 'sending'}
              onClick={() => feed(dev.id, portion)}
            >
              {op?.phase === 'sending' ? '投喂中…' : `确认投喂 ${portion}g`}
            </button>
            <p className="mt-2 text-[12px] text-muted">Demo 模拟投喂反馈；执行成功后将在记录中生成一条进食事件。</p>
          </>
        )}
        {dev.type === 'water' && (
          <>
            <h4 className="mb-3 text-sm font-bold">智能饮水器</h4>
            <div className="flex items-center justify-between py-2 text-xs"><span>水位</span><b>{String(st.level ?? 72)}%</b></div>
            <button className="btn btn-primary mt-2 w-full" disabled={offline} onClick={() => execDevice(dev.id, '启动循环出水')}>循环出水</button>
          </>
        )}
        {dev.type === 'ac' && (
          <>
            <h4 className="mb-3 text-sm font-bold">空调控制</h4>
            <div className="my-3 flex items-center justify-center gap-4">
              <button className="grid h-10 w-10 place-items-center rounded-xl bg-[#edf3f0] text-xl text-teal" onClick={() => updateDevice(dev.id, { status: { ...st, target: Math.max(18, Number(st.target ?? 26) - 1) } })}>−</button>
              <b className="text-4xl">{Number(st.target ?? 26)}℃</b>
              <button className="grid h-10 w-10 place-items-center rounded-xl bg-[#edf3f0] text-xl text-teal" onClick={() => updateDevice(dev.id, { status: { ...st, target: Math.min(30, Number(st.target ?? 26) + 1) } })}>＋</button>
            </div>
            <div className="flex items-center justify-between py-2 text-xs"><span>状态</span><b>{st.power ? '运行中' : '待机'}</b></div>
            <button
              className="btn btn-primary mt-2 w-full"
              disabled={offline}
              onClick={() => execDevice(dev.id, `开启空调 ${Number(st.target ?? 26)}℃`, { apply: () => updateDevice(dev.id, { status: { ...dev.status, power: true } }) })}
            >
              发送空调指令
            </button>
          </>
        )}
        {dev.type === 'temp_humidity' && (
          <>
            <h4 className="mb-3 text-sm font-bold">实时环境</h4>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Metric b={`${room?.environment.temperature.toFixed(1)}℃`} s="温度" />
              <Metric b={`${room?.environment.humidity}%`} s="湿度" />
              <Metric b="良好" s="舒适度" />
            </div>
          </>
        )}
        {dev.type === 'toy' && (
          <button className="btn btn-primary w-full" disabled={offline} onClick={() => execDevice(dev.id, '启动逗宠模组')}>启动逗宠</button>
        )}
      </div>
    </Modal>
  )
}

function Range({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <label className="text-xs">{label}</label>
      <input type="range" min={0} max={100} value={value} className="w-[55%] accent-teal" onChange={(e) => onChange(Number(e.target.value))} />
      <b className="text-xs">{value}%</b>
    </div>
  )
}
function Metric({ b, s }: { b: string; s: string }) {
  return (
    <div className="rounded-xl bg-[#f1f6f3] py-2.5">
      <b className="block text-lg">{b}</b>
      <span className="text-[12px] text-muted">{s}</span>
    </div>
  )
}
