import { useState } from 'react'
import { useStore } from '@/store/useStore'
import { summarizeDay, buildDiary, eventsForPet, activityDigest, fmtDuration, filterByRange, type TimeRange } from '@/lib/diary'

const RANGES: { key: TimeRange; label: string }[] = [
  { key: 'today', label: '今天' },
  { key: '7d', label: '近 7 天' },
  { key: 'month', label: '本月' },
]

export function RecordsPage() {
  const openModal = useStore((s) => s.openModal)
  const toggleDrawer = useStore((s) => s.toggleDrawer)
  const events = useStore((s) => s.events)
  const home = useStore((s) => s.homeMap)
  const pet = useStore((s) => s.pet)
  const pets = useStore((s) => s.pets)
  const diarySeed = useStore((s) => s.diarySeed)
  const moodSignal = useStore((s) => s.moodSignal)
  const companionEnabled = useStore((s) => s.companionEnabled)
  const setCompanionEnabled = useStore((s) => s.setCompanionEnabled)
  const triggerLowMood = useStore((s) => s.triggerLowMood)
  const regenerateDiary = useStore((s) => s.regenerateDiary)
  const openCamera = useStore((s) => s.openCamera)
  const toast = useStore((s) => s.toast)
  const demoMode = useStore((s) => s.demoMode)
  const [range, setRange] = useState<TimeRange>('today')

  const now = Date.now()
  const petEvents = eventsForPet(events, pet.id, pets[0]?.id)
  // 统计/图表按所选时间范围；日记固定取“今天”
  const ranged = filterByRange(petEvents, range, now)
  const rangeLabel = RANGES.find((r) => r.key === range)!.label
  const sum = summarizeDay(ranged, home)
  // 时长估算：今天统计到当前时刻；更长区间统计到最后一次事件，避免把空档全算成休息
  const lastTs = ranged.reduce((m, e) => Math.max(m, e.timestamp), 0)
  const digest = activityDigest(ranged, range === 'today' ? now : lastTs || now)
  const todayEvents = filterByRange(petEvents, 'today', now)
  const todaySum = summarizeDay(todayEvents, home)
  const todayDigest = activityDigest(todayEvents, now)
  const diary = buildDiary(todaySum, moodSignal, diarySeed)
  const freq = [
    { l: '进食', v: sum.eats },
    { l: '饮水', v: sum.drinks },
    { l: '玩耍', v: sum.plays },
    { l: '跨房间', v: sum.roomChanges },
    { l: '远程陪伴', v: sum.ownerInteractions },
  ]
  const freqMax = Math.max(1, ...freq.map((f) => f.v))

  return (
    <div>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <div className="eyebrow">DAILY MEMORY</div>
          <h2 className="my-1 text-3xl font-extrabold">记录</h2>
          <div className="text-sm text-muted">轨迹、行为、声音与陪伴事件汇总在这里。</div>
        </div>
        <div className="flex rounded-2xl bg-[#e4ebe7] p-1" data-testid="records-range">
          {RANGES.map((r) => (
            <button
              key={r.key}
              data-testid={`range-${r.key}`}
              onClick={() => setRange(r.key)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${range === r.key ? 'bg-white text-teal shadow-softsm' : 'text-[#6f817b]'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3.5 max-[640px]:grid-cols-1">
        <RecordCard ico="⌁" title="历史行踪" desc="查看房间迁移、停留热点与对应时刻影像。" onClick={() => toggleDrawer(true)} />
        <RecordCard ico="🐾" title="动作识别" desc="睡觉、进食、喝水、玩耍、跑动等行为统计。" onClick={() => openModal('action')} />
        <RecordCard ico="〽" title="声音识别" desc="叫声、呼噜等声音事件与片段记录。" onClick={() => openModal('sound')} />
      </div>

      <div className="mt-5 grid grid-cols-[1.1fr_.9fr] gap-5 max-[900px]:grid-cols-1">
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-bold">行为统计 · {rangeLabel}</h3>
            <span className="badge" data-testid="records-count">{ranged.length} 条事件</span>
          </div>

          {/* 行为时间分布（时长，仅“今天”有意义） */}
          {range === 'today' && (
            <>
              <div className="mb-2 text-xs font-bold text-[#4c5f59]">行为时间分布</div>
              <div className="mb-4 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl bg-[#f2f7f4] py-2.5"><b className="block text-base">{fmtDuration(digest.activeMinutes)}</b><span className="text-[12px] text-muted">活动时长</span></div>
                <div className="rounded-xl bg-[#f2f7f4] py-2.5"><b className="block text-base">{fmtDuration(digest.restMinutes)}</b><span className="text-[12px] text-muted">休息时长</span></div>
              </div>
            </>
          )}

          {/* 事件频次（次数） */}
          <div className="mb-2 text-xs font-bold text-[#4c5f59]">事件频次（{rangeLabel}）</div>
          {freq.map((b) => (
            <div key={b.l} className="mb-2.5 grid grid-cols-[70px_1fr_52px] items-center gap-2.5 text-xs">
              <span>{b.l}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-[#edf2ef]"><i className="block h-full rounded-full bg-gradient-to-r from-teal-2 to-[#7db7aa]" style={{ width: `${(b.v / freqMax) * 100}%` }} /></span>
              <b>{b.v} 次</b>
            </div>
          ))}
        </div>

        <div className="rounded-[26px] border border-[#e2e9e4] bg-gradient-to-br from-[#f0f8f4] to-[#fffaf4] p-6 shadow-softsm">
          <div className="flex items-center justify-between gap-2">
            <span className="badge">{pet.name}的今天 · AI 拟人</span>
            <span className="badge badge-warn">情绪陪伴</span>
          </div>
          <div data-testid="diary-text" className="my-4 text-lg font-bold leading-relaxed tracking-tight">“{diary}”</div>

          {/* 关联真实事件：日记背后的进食/活动/休息等真实数据 */}
          <div data-testid="diary-facts" className="mt-1 rounded-2xl border border-[#e0e8e4] bg-white/70 p-3">
            <b className="mb-2 block text-[11px] text-[#4c5f59]">日记背后的真实事件</b>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Fact v={`${todayDigest.eats + todayDigest.drinks} 次`} s="进食 / 饮水" />
              <Fact v={fmtDuration(todayDigest.activeMinutes)} s="活动时长" />
              <Fact v={fmtDuration(todayDigest.restMinutes)} s="休息时长" />
              <Fact v={`${todayDigest.plays} 次`} s="玩耍" />
              <Fact v={`${todayDigest.roomChanges} 趟`} s="跨房间" />
              <Fact v={`${todayDigest.owner} 次`} s="远程陪伴" />
            </div>
          </div>

          <div data-testid="emotion-signal" className={`mt-3.5 rounded-2xl border p-3 text-[11px] leading-relaxed ${moodSignal ? 'border-[#f2dcc5] bg-[#fff2e4] text-[#8b623f]' : 'border-[#e0e8e4] bg-[#f3f7f5] text-[#61736d]'}`}>
            <b>主人陪伴线索：{moodSignal ? '触发一条温和提醒' : '暂无提醒'}</b>
            <br />
            {moodSignal
              ? '在你已开启功能的前提下，今天与小度的主动语音互动出现“语气较平时偏低”的弱信号，同时外出活动较少。仅用于生成陪伴建议，不作健康判断。'
              : '只有在你主动开启“情绪陪伴”后，系统才会结合与小度的轻量互动线索生成陪伴提醒，不作任何健康或心理判断。'}
          </div>

          {moodSignal && (
            <div data-testid="emotion-push" className="animate-pop mt-2.5 rounded-2xl border border-[#e4eae6] bg-white p-3.5 shadow-softsm">
              <div className="text-[11px] uppercase tracking-wide text-muted">APP PUSH · 来自{pet.name}</div>
              <b className="my-1.5 block text-sm">“今天听起来你有点没精神。”</b>
              <p className="m-0 mb-2.5 text-[11px] leading-relaxed text-[#6c7d77]">带我出去走走吧？我今天也想多活动一会儿 🐾</p>
              <div className="flex gap-2">
                <button className="btn btn-primary" onClick={() => openCamera()}>先看看{pet.name}</button>
                <button className="btn" onClick={() => toast('success', '已加入今晚散步提醒')}>今晚去散步</button>
              </div>
            </div>
          )}

          <div className="mt-3.5 flex items-center justify-between rounded-2xl bg-white/70 p-2.5">
            <span className="text-[11px] text-muted">开启情绪陪伴（需主动授权）</span>
            <button data-testid="companion-toggle" className={`toggle ${companionEnabled ? 'on' : ''}`} aria-label="情绪陪伴开关" onClick={() => setCompanionEnabled(!companionEnabled)} />
          </div>
          <div className="mt-2.5 flex gap-2">
            <button className="btn btn-primary" onClick={regenerateDiary}>换一条 AI 日记</button>
            {demoMode && <button data-testid="low-mood-btn" className="btn" disabled={!companionEnabled} onClick={triggerLowMood}>模拟情绪偏低</button>}
          </div>
        </div>
      </div>

      <div className="card mt-5">
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold">关键事件 · {rangeLabel}</h3><button className="text-xs font-bold text-teal" onClick={() => toggleDrawer(true)}>在踪迹栏查看</button></div>
        {ranged.length ? (
          <div className="grid grid-cols-3 gap-3.5 max-[640px]:grid-cols-1">
            {ranged.slice(0, 6).map((e) => {
              const roomName = home.rooms.find((r) => r.id === (e.toRoomId ?? e.roomId))?.name
              return (
                <div key={e.id} data-testid="record-item" className="rounded-2xl border border-line bg-white p-4">
                  <div className="flex items-center justify-between">
                    <span className="badge">{new Date(e.timestamp).toTimeString().slice(0, 5)}</span>
                    {roomName && <span className="text-[12px] text-muted">{roomName}</span>}
                  </div>
                  <h4 className="my-2 text-base font-bold">{e.title}</h4>
                  <p className="m-0 text-xs text-muted">{e.detail}</p>
                  {(e.source?.length || e.media) && (
                    <div className="mt-2 flex items-center gap-2 text-[12px] text-[#8aa39b]">
                      {e.source?.length ? <span>来源：{e.source.join(' + ')}</span> : null}
                      {e.media ? <span className="rounded bg-[#eef3ef] px-1.5 py-0.5">{e.media.type === 'video' ? '▶ 视频' : '📷 图片'}</span> : null}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[#d6e1db] bg-[#f7faf8] p-6 text-center text-xs text-muted">{rangeLabel}内{pet.name}暂无事件记录。</div>
        )}
      </div>
    </div>
  )
}

function RecordCard({ ico, title, desc, onClick }: { ico: string; title: string; desc: string; onClick: () => void }) {
  return (
    <button className="rounded-2xl border border-line bg-white p-4 text-left shadow-softsm transition hover:-translate-y-0.5" onClick={onClick}>
      <div className="text-2xl">{ico}</div>
      <h4 className="my-2 text-base font-bold">{title}</h4>
      <p className="m-0 text-xs leading-relaxed text-muted">{desc}</p>
    </button>
  )
}

function Fact({ v, s }: { v: string; s: string }) {
  return (
    <div className="rounded-xl bg-[#f2f7f4] px-2 py-2">
      <b className="block truncate text-xs text-[#2f473f]">{v}</b>
      <span className="text-[12px] text-muted">{s}</span>
    </div>
  )
}
