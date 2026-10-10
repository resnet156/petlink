import { useState } from 'react'
import { roomBounds } from '@/domain/geometry'
import type { Room } from '@/domain/types'
import type { useMapEditor } from './useMapEditor'

type Editor = ReturnType<typeof useMapEditor>

const KINDS: { value: Room['kind']; label: string }[] = [
  { value: 'living', label: '客厅 / 通用' },
  { value: 'bedroom', label: '卧室' },
  { value: 'study', label: '书房' },
  { value: 'balcony', label: '阳台' },
  { value: 'dining', label: '餐厅 / 厨房' },
  { value: 'custom', label: '自定义' },
]

export function InspectorPanel({ editor }: { editor: Editor }) {
  const { rooms, selected } = editor
  const room = selected >= 0 ? rooms[selected] : undefined
  const [confirmDel, setConfirmDel] = useState<number>(-1)

  return (
    <div className="flex max-h-[440px] flex-col gap-2 overflow-auto rounded-[18px] border border-line bg-[#f3f7f4] p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold">房间列表</h4>
        <button className="btn" onClick={editor.addPreset}>＋ 房间</button>
      </div>

      {!rooms.length && (
        <div className="rounded-xl border border-dashed border-[#cbd8d2] bg-white p-4 text-center text-[11px] text-muted">
          暂无房间。点击“＋ 房间”或在左侧绘制。
        </div>
      )}

      {rooms.map((r, i) => (
        <div
          key={r.id}
          data-testid="room-row"
          className={`grid grid-cols-[28px_1fr_auto_28px] items-center gap-1.5 rounded-xl border bg-white p-1.5 ${
            i === selected ? 'border-[#80b9aa] ring-2 ring-teal-2/10' : 'border-line'
          }`}
        >
          <button className="rounded-lg bg-[#edf2ef] py-1 text-xs" onClick={() => editor.setSelected(i)}>
            {i + 1}
          </button>
          <input
            className="w-full border-0 bg-transparent text-xs font-bold text-ink outline-none"
            value={r.name}
            aria-label={`房间名称 ${i + 1}`}
            onFocus={() => editor.setSelected(i)}
            onChange={(e) => { editor.setSelected(i); editor.renameAt(i, e.target.value) }}
          />
          <button className="rounded-lg bg-teal-soft px-2 py-1 text-[12px] text-teal" onClick={() => editor.setSelected(i)}>
            编辑
          </button>
          <button
            className="rounded-lg bg-[#edf2ef] py-1 text-[#60726b]"
            aria-label="删除"
            data-testid="room-del"
            onClick={() => setConfirmDel(i)}
          >
            ×
          </button>
        </div>
      ))}

      {confirmDel >= 0 && rooms[confirmDel] && (
        <div data-testid="room-del-confirm" className="rounded-xl border border-[#f0cfca] bg-[#fdeeec] p-2.5 text-[11px] text-[#9c413a]">
          <div className="mb-2">确认删除房间「{rooms[confirmDel].name}」？该操作可通过“撤销”恢复。</div>
          <div className="flex gap-1.5">
            <button className="btn !py-1.5 !text-[11px]" onClick={() => setConfirmDel(-1)}>取消</button>
            <button
              className="btn btn-red !py-1.5 !text-[11px]"
              data-testid="room-del-ok"
              onClick={() => { editor.setSelected(confirmDel); editor.remove(); setConfirmDel(-1) }}
            >
              删除
            </button>
          </div>
        </div>
      )}

      {room && (
        <div data-testid="room-inspector" className="mt-1 rounded-2xl border border-[#dbe7e1] bg-[#f4f8f6] p-3">
          <div className="mb-2 flex items-center justify-between">
            <b className="text-[13px]">单个房间编辑</b>
            <span className="badge">#{selected + 1}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] text-muted">房间名称</label>
              <input className="field !py-2 text-[11px]" value={room.name} onChange={(e) => editor.setName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted">房间类型 / 家具</label>
              <select className="field !py-2 text-[11px]" value={room.kind} onChange={(e) => editor.setKind(e.target.value as Room['kind'])}>
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>{k.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            <button className="btn !px-1 !py-2 !text-[11px]" onClick={() => editor.nudge(-15, 0)}>← 左</button>
            <button className="btn !px-1 !py-2 !text-[11px]" onClick={() => editor.nudge(15, 0)}>右 →</button>
            <button className="btn !px-1 !py-2 !text-[11px]" onClick={() => editor.nudge(0, -15)}>↑ 上</button>
            <button className="btn !px-1 !py-2 !text-[11px]" onClick={() => editor.nudge(0, 15)}>下 ↓</button>
          </div>
          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
            <button className="btn !px-1 !py-2 !text-[11px]" onClick={() => editor.scale(0.92, 1)}>缩窄</button>
            <button className="btn !px-1 !py-2 !text-[11px]" onClick={() => editor.scale(1.08, 1)}>加宽</button>
            <button className="btn !px-1 !py-2 !text-[11px]" onClick={() => editor.scale(1, 0.92)}>变矮</button>
            <button className="btn !px-1 !py-2 !text-[11px]" onClick={() => editor.scale(1, 1.08)}>变高</button>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <button data-testid="add-vertex" className="btn !py-2 !text-[11px]" onClick={editor.addVertex}>＋ 添加转角</button>
            <button className="btn !py-2 !text-[11px]" onClick={editor.duplicate}>复制房间</button>
          </div>
          <div className="mt-2 rounded-lg bg-[#eef6f2] px-2.5 py-2 text-[11px] leading-relaxed text-[#60746c]">
            拖动绿色顶点改形状；<b>双击顶点可删除</b>（至少保留 3 个）。
          </div>
          <div className="mt-2 text-[11px] text-muted">
            {geomText(room)}
          </div>
        </div>
      )}
    </div>
  )
}

function geomText(r: Room) {
  const b = roomBounds(r)
  return `位置 x ${Math.round(b.x)} · y ${Math.round(b.y)} ｜ 宽 ${Math.round(b.w)} · 高 ${Math.round(b.h)} ｜ ${r.polygon.length} 个顶点`
}
