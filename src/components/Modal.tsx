import { useEffect, type ReactNode } from 'react'

export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  desc,
  children,
  wide,
  testId,
}: {
  open: boolean
  onClose: () => void
  title: string
  eyebrow?: string
  desc?: string
  children: ReactNode
  wide?: boolean
  testId?: string
}) {
  // Esc 关闭（§5.4 键盘可达性）
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="app-no-drag fixed inset-0 z-[120] flex items-center justify-center bg-[rgba(24,42,38,.28)] p-6 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        data-testid={testId}
        className={`max-h-[88vh] w-full overflow-auto rounded-[28px] border border-white/60 bg-[#fbfcfa] p-6 shadow-soft ${
          wide ? 'max-w-[980px]' : 'max-w-[720px]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            <h3 className="my-1 text-xl font-bold">{title}</h3>
            {desc && <p className="m-0 text-xs leading-relaxed text-muted">{desc}</p>}
          </div>
          <button
            className="grid h-9 w-9 place-items-center rounded-xl bg-[#edf2ef] text-[#6e7f79]"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
