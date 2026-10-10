import { useStore } from '@/store/useStore'
import { timeHM } from '@/lib/time'
import { summarizeDay } from '@/lib/diary'

export function TrailDrawer() {
  const open = useStore((s) => s.drawerOpen)
  const toggleDrawer = useStore((s) => s.toggleDrawer)
  const events = useStore((s) => s.events)
  const openEvent = useStore((s) => s.openEvent)
  const openCamera = useStore((s) => s.openCamera)
  const home = useStore((s) => s.homeMap)
  const sum = summarizeDay(events, home)

  return (
    <>
      <button
        onClick={() => toggleDrawer()}
        data-testid="trail-tab"
        className="fixed top-1/2 z-[80] flex min-h-[140px] w-12 -translate-y-1/2 flex-col items-center justify-center gap-2.5 rounded-l-[18px] border border-r-0 border-[#d9e2dd] bg-white text-xs font-extrabold tracking-[2px] text-teal shadow-soft transition-[right]"
        style={{ right: open ? 380 : 0, writingMode: 'vertical-rl' }}
      >
        宠物踪迹
      </button>

      <aside
        data-testid="trail-drawer"
        className="fixed right-0 top-0 z-[75] flex h-screen w-[380px] flex-col border-l border-line bg-[rgba(251,252,250,.98)] p-6 shadow-soft transition-transform max-[640px]:w-[92vw]"
        style={{ transform: open ? 'none' : 'translateX(100%)' }}
      >
        <div className="flex items-center justify-between">
          <div><div className="eyebrow">PET TRAIL</div><h3 className="text-xl font-bold">毛球的踪迹</h3></div>
          <button className="grid h-9 w-9 place-items-center rounded-xl bg-[#edf2ef] text-[#6e7f79]" onClick={() => toggleDrawer(false)}>×</button>
        </div>
        <div className="my-4 grid grid-cols-3 gap-1.5 rounded-2xl border border-[#d9e8e2] bg-gradient-to-br from-[#e6f4ef] to-[#f7fbf8] p-3.5 text-center">
          <div><b className="block text-base">{sum.roomChanges}</b><span className="text-[12px] text-muted">房间切换</span></div>
          <div><b className="block text-base">{events.length}</b><span className="text-[12px] text-muted">关键事件</span></div>
          <div><b className="block text-base">{sum.plays}</b><span className="text-[12px] text-muted">玩耍</span></div>
        </div>

        <div className="flex-1 overflow-auto pb-10 pr-1">
          {events.map((e) => (
            <div key={e.id} className="relative pb-5 pl-8">
              <i className="absolute left-1 top-1 h-3.5 w-3.5 rounded-full border-4 border-teal-2 bg-white" />
              {events[events.length - 1].id !== e.id && <span className="absolute left-[10px] top-[18px] bottom-[-2px] w-px bg-line" />}
              <button className="w-full rounded-2xl border border-line bg-white p-3.5 text-left transition hover:border-[#bfd6ce]" onClick={() => openEvent(e)} data-testid="trail-event">
                <span className="text-[11px] font-bold tracking-wide text-[#9aa8a3]">{timeHM(e.timestamp)}</span>
                <b className="my-1 block text-sm">{e.title}</b>
                <span className="text-[11px] text-muted">{e.detail}</span>
                {e.media && (
                  <span className="mt-2.5 flex h-[70px] items-center justify-center rounded-xl bg-[repeating-linear-gradient(45deg,#eef3ef,#eef3ef_8px,#f9fbf9_8px,#f9fbf9_16px)] text-[11px] text-[#81908a]">
                    {e.media.type === 'video' ? '▶ 查看视频摘要' : '📷 查看对应摄像头片段'}
                  </span>
                )}
              </button>
              {(e.type === 'room_change' || e.type === 'bell') && (
                <button className="mt-1.5 text-[12px] font-bold text-teal" onClick={() => openCamera()}>跳到对应摄像头 →</button>
              )}
            </div>
          ))}
        </div>
      </aside>
    </>
  )
}
