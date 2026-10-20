import type { HomeMap, PetEvent } from '@/domain/types'

export type DiarySummary = {
  roomVisits: { roomName: string; count: number }[]
  eats: number
  drinks: number
  plays: number
  ownerInteractions: number
  bells: number
  roomChanges: number
}

/** 客观数据摘要：完全来自真实事件流，不含拟人化措辞 */
export function summarizeDay(events: PetEvent[], home: HomeMap): DiarySummary {
  const roomName = (id?: string) => home.rooms.find((r) => r.id === id)?.name ?? '其他'
  const visits = new Map<string, number>()
  let eats = 0,
    drinks = 0,
    plays = 0,
    ownerInteractions = 0,
    bells = 0,
    roomChanges = 0
  for (const e of events) {
    if (e.type === 'room_change') {
      roomChanges += 1
      const n = roomName(e.toRoomId ?? e.roomId)
      visits.set(n, (visits.get(n) ?? 0) + 1)
    }
    if (e.type === 'eat') eats += 1
    if (e.type === 'drink') drinks += 1
    if (e.type === 'play') plays += 1
    if (e.type === 'owner_interaction') ownerInteractions += 1
    if (e.type === 'bell') bells += 1
  }
  const roomVisits = [...visits.entries()]
    .map(([roomName, count]) => ({ roomName, count }))
    .sort((a, b) => b.count - a.count)
  return { roomVisits, eats, drinks, plays, ownerInteractions, bells, roomChanges }
}

/** 房间停留占比（用于历史模式热点），基于 room_change 目标房间计数 */
export function roomShare(events: PetEvent[], home: HomeMap): { roomName: string; pct: number }[] {
  const { roomVisits } = summarizeDay(events, home)
  const total = roomVisits.reduce((a, r) => a + r.count, 0) || 1
  return roomVisits.map((r) => ({ roomName: r.roomName, pct: Math.round((r.count / total) * 100) }))
}

/** 房间停留时长（按 room_change 时间线推导：进入某房间到下一次迁移/此刻的时长），返回占比+分钟 */
export function roomStay(events: PetEvent[], home: HomeMap, now: number): { roomName: string; pct: number; minutes: number }[] {
  const roomName = (id?: string) => home.rooms.find((r) => r.id === id)?.name ?? '其他'
  const moves = events.filter((e) => e.type === 'room_change').sort((a, b) => a.timestamp - b.timestamp)
  if (!moves.length) return []
  const mins = new Map<string, number>()
  for (let i = 0; i < moves.length; i++) {
    const name = roomName(moves[i].toRoomId ?? moves[i].roomId)
    const end = i + 1 < moves.length ? moves[i + 1].timestamp : now
    const dur = Math.max(0, (end - moves[i].timestamp) / 60000)
    mins.set(name, (mins.get(name) ?? 0) + dur)
  }
  const total = [...mins.values()].reduce((a, b) => a + b, 0) || 1
  return [...mins.entries()]
    .map(([roomName, minutes]) => ({ roomName, minutes: Math.round(minutes), pct: Math.round((minutes / total) * 100) }))
    .sort((a, b) => b.minutes - a.minutes)
}

/** 取某只宠物的事件：带 petId 的按 petId 归属；历史遗留未标注的归到主宠物 */
export function eventsForPet(events: PetEvent[], petId: string, primaryPetId?: string): PetEvent[] {
  return events.filter((e) => (e.petId ?? primaryPetId) === petId)
}

export type TimeRange = 'today' | '7d' | 'month'

/** 按时间范围筛选事件（今天 / 近 7 天 / 本月） */
export function filterByRange(events: PetEvent[], range: TimeRange, now: number): PetEvent[] {
  const d = new Date(now)
  let cutoff: number
  if (range === 'today') cutoff = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  else if (range === '7d') cutoff = now - 7 * 24 * 60 * 60 * 1000
  else cutoff = new Date(d.getFullYear(), d.getMonth(), 1).getTime()
  return events.filter((e) => e.timestamp >= cutoff && e.timestamp <= now)
}

export type ActivityDigest = {
  eats: number
  drinks: number
  plays: number
  roomChanges: number
  owner: number
  /** 估算活跃时长（分钟） */
  activeMinutes: number
  /** 估算休息时长（分钟） */
  restMinutes: number
  lastActiveAt: number | null
}

const ACTIVE_TYPES = new Set(['room_change', 'play', 'run', 'eat', 'drink', 'owner_interaction', 'bell', 'sound'])
const REST_GAP_MIN = 30

/** 由真实事件时间线推导活动/休息时长（估算）+ 关键行为计数。events 应为单只宠物的事件。 */
export function activityDigest(events: PetEvent[], now: number): ActivityDigest {
  let eats = 0, drinks = 0, plays = 0, roomChanges = 0, owner = 0
  for (const e of events) {
    if (e.type === 'eat') eats += 1
    else if (e.type === 'drink') drinks += 1
    else if (e.type === 'play') plays += 1
    else if (e.type === 'room_change') roomChanges += 1
    else if (e.type === 'owner_interaction') owner += 1
  }
  const acts = events.filter((e) => ACTIVE_TYPES.has(e.type)).sort((a, b) => a.timestamp - b.timestamp)
  let active = 0, rest = 0
  for (let i = 1; i < acts.length; i++) {
    const gap = (acts[i].timestamp - acts[i - 1].timestamp) / 60000
    if (gap <= REST_GAP_MIN) active += gap
    else rest += gap
  }
  const lastActiveAt = acts.length ? acts[acts.length - 1].timestamp : null
  if (lastActiveAt) {
    const tail = (now - lastActiveAt) / 60000
    if (tail > 0) rest += tail
  }
  return { eats, drinks, plays, roomChanges, owner, activeMinutes: Math.round(active), restMinutes: Math.round(rest), lastActiveAt }
}

/** 分钟 → “约 Xh Ym” / “约 N 分钟” */
export function fmtDuration(min: number): string {
  if (min < 1) return '不到 1 分钟'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h <= 0) return `约 ${m} 分钟`
  if (m === 0) return `约 ${h} 小时`
  return `约 ${h} 小时 ${m} 分`
}

const pick = <T,>(arr: T[], seed: number): T => arr[Math.abs(Math.floor(seed)) % arr.length]

/**
 * 第一人称 AI 日记：由该宠物当日真实事件摘要生成（措辞拟人，事实部分完全来自数据）。
 * lowMood 为「情绪陪伴」被触发时的温和基调；seed 用于「换一条」在等价措辞间切换。
 */
export function buildDiary(s: DiarySummary, lowMood: boolean, seed = 0): string {
  const facts: string[] = []
  if (s.roomVisits.length) facts.push(`在${s.roomVisits[0].roomName}待的时间最久`)
  if (s.eats) facts.push(`吃了 ${s.eats} 顿饭`)
  if (s.drinks) facts.push(`喝了 ${s.drinks} 次水`)
  if (s.plays) facts.push(`玩了 ${s.plays} 回`)
  if (s.roomChanges) facts.push(`在家里转了 ${s.roomChanges} 趟`)

  const openers = lowMood
    ? ['今天家里有点安静，', '你今天好像挺忙的，', '我自己待了一会儿，']
    : ['今天过得挺充实的，', '又是元气满满的一天，', '今天我挺开心的，']
  const body = facts.length ? `我${facts.slice(0, 4).join('，')}。` : '今天比较安静，大部分时间都在休息。'
  const ownerLine =
    s.ownerInteractions > 0
      ? `你还远程陪了我 ${s.ownerInteractions} 次，我都感受到啦。`
      : '今天还没顾上陪我，有空来看看我呀。'
  const closers = lowMood
    ? ['晚上能早点回来吗？我想你了 🐾', '要不要带我出去走走？', '记得回家抱抱我。']
    : ['晚上等你回家！', '想你了，早点回来呀～', '今天也要开开心心哦。']

  return `${pick(openers, seed)}${body}${ownerLine}${pick(closers, seed + 1)}`
}

