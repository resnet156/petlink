import { useState } from 'react'
import { useStore } from '@/store/useStore'
import { useAuth } from '@/store/useAuth'
import { isCloudEnabled } from '@/lib/supabase'
import { Modal } from '@/components/Modal'

export function AuthModal() {
  const open = useStore((s) => s.modal === 'auth')
  const close = useStore((s) => s.closeModal)
  const toast = useStore((s) => s.toast)
  const { user, signIn, signUp, signOut, error, syncing, recovery, resetPassword, updatePassword, homeOwnerId, joinHome, leaveHome } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPass, setNewPass] = useState('')
  const [joinId, setJoinId] = useState('')
  const [busy, setBusy] = useState(false)

  const doReset = async () => {
    if (!email) return toast('warn', '请先填写邮箱')
    const ok = await resetPassword(email)
    toast(ok ? 'success' : 'error', ok ? '密码重置邮件已发送，请查收邮箱' : (useAuth.getState().error || '发送失败'))
  }

  const doUpdatePassword = async () => {
    if (newPass.length < 6) return toast('warn', '新密码至少 6 位')
    const ok = await updatePassword(newPass)
    toast(ok ? 'success' : 'error', ok ? '密码已更新，请用新密码登录' : (useAuth.getState().error || '更新失败'))
    if (ok) setNewPass('')
  }

  const submit = async () => {
    if (!email || !password) return toast('warn', '请填写邮箱和密码')
    setBusy(true)
    if (mode === 'in') await signIn(email, password)
    else await signUp(email, password)
    setBusy(false)
    const err = useAuth.getState().error
    if (!err) {
      toast('success', mode === 'in' ? '登录成功，正在同步云端数据' : '注册成功，请查收邮箱验证（如开启验证）')
      if (useAuth.getState().user) close()
    }
  }

  return (
    <Modal open={open} onClose={close} title="账号与云端同步" eyebrow="ACCOUNT" desc="登录后，户型 / 设备 / 规则 / 围栏 / 事件将保存到云端，多设备自动同步。" testId="auth-modal">
      {!isCloudEnabled ? (
        <div className="rounded-2xl border border-[#f3dec8] bg-orange-soft p-4 text-xs leading-relaxed text-[#8b623f]">
          <b>云端未配置</b>
          <p className="mt-1">
            当前未设置 Supabase 环境变量，应用运行在<strong>纯本地模式</strong>（数据仅存本机浏览器）。
            按 README「后端账号 + 云端同步」配置 <code>VITE_SUPABASE_URL</code> 与 <code>VITE_SUPABASE_ANON_KEY</code> 并执行 <code>supabase/schema.sql</code> 后即可启用登录与多设备同步。
          </p>
        </div>
      ) : recovery ? (
        <div>
          <div className="mb-3 rounded-2xl border border-[#d9e8e2] bg-teal-soft p-3 text-xs leading-relaxed text-teal">
            正在通过邮件链接重置密码，请设置新密码。
          </div>
          <label className="mb-1 block text-[11px] text-muted">新密码</label>
          <input className="field" type="password" value={newPass} data-testid="auth-newpass" onChange={(e) => setNewPass(e.target.value)} placeholder="至少 6 位" onKeyDown={(e) => { if (e.key === 'Enter') void doUpdatePassword() }} />
          {error && <div className="mt-2 text-[11px] text-red">{error}</div>}
          <button className="btn btn-primary mt-4 w-full" onClick={doUpdatePassword}>更新密码</button>
        </div>
      ) : user ? (
        <div>
          <div className="rounded-2xl border border-line bg-white p-4">
            <div className="text-xs text-muted">当前登录</div>
            <b className="text-sm">{user.email}</b>
            <div className="mt-1 text-[11px] text-teal">{syncing ? '正在同步云端…' : '云端同步已开启'}</div>
          </div>

          {/* 家庭共享 */}
          <div className="mt-3 rounded-2xl border border-line bg-white p-4" data-testid="family-share">
            <b className="text-sm">家庭共享</b>
            {homeOwnerId && homeOwnerId !== user.id ? (
              <>
                <p className="mt-1 text-xs text-muted">已加入家庭：<span className="break-all font-mono text-[12px]">{homeOwnerId}</span>，与该家庭共享同一份数据。</p>
                <button className="btn mt-2" onClick={async () => { await leaveHome(); toast('info', '已离开家庭，回到自己的家') }}>离开家庭</button>
              </>
            ) : (
              <>
                <p className="mt-1 text-xs text-muted">把下面的「家庭 ID」发给家人，对方粘贴即可加入、共享你的宠物与户型数据。</p>
                <div className="mt-2 flex items-center gap-2">
                  <input className="field !py-1.5 font-mono text-[12px]" readOnly value={user.id} aria-label="我的家庭ID" />
                  <button className="btn !py-1.5" onClick={() => { void navigator.clipboard?.writeText(user.id); toast('success', '家庭 ID 已复制') }}>复制</button>
                </div>
                <label className="mb-1 mt-3 block text-[11px] text-muted">加入他人的家庭</label>
                <div className="flex items-center gap-2">
                  <input className="field !py-1.5 font-mono text-[12px]" data-testid="join-home-input" value={joinId} onChange={(e) => setJoinId(e.target.value)} placeholder="粘贴家庭 ID" />
                  <button className="btn btn-primary !py-1.5" data-testid="join-home-btn" onClick={async () => {
                    const ok = await joinHome(joinId)
                    toast(ok ? 'success' : 'error', ok ? '已加入家庭并同步数据' : (useAuth.getState().error || '加入失败'))
                  }}>加入</button>
                </div>
              </>
            )}
          </div>

          <button className="btn mt-3" onClick={async () => { await signOut(); toast('info', '已退出登录，回到本地模式') }}>
            退出登录
          </button>
        </div>
      ) : (
        <div>
          <div className="mb-3 flex gap-1.5 rounded-2xl bg-[#eef3f0] p-1.5">
            <button className={`flex-1 rounded-xl py-2 text-xs font-bold ${mode === 'in' ? 'bg-white text-teal shadow-softsm' : 'text-[#72817c]'}`} onClick={() => setMode('in')}>登录</button>
            <button className={`flex-1 rounded-xl py-2 text-xs font-bold ${mode === 'up' ? 'bg-white text-teal shadow-softsm' : 'text-[#72817c]'}`} onClick={() => setMode('up')}>注册</button>
          </div>
          <label className="mb-1 block text-[11px] text-muted">邮箱</label>
          <input className="field" type="email" value={email} data-testid="auth-email" onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          <label className="mb-1 mt-3 block text-[11px] text-muted">密码</label>
          <input className="field" type="password" value={password} data-testid="auth-password" onChange={(e) => setPassword(e.target.value)} placeholder="至少 6 位" onKeyDown={(e) => { if (e.key === 'Enter') void submit() }} />
          {error && <div className="mt-2 text-[11px] text-red">{error}</div>}
          <button className="btn btn-primary mt-4 w-full" data-testid="auth-submit" disabled={busy} onClick={submit}>
            {busy ? '处理中…' : mode === 'in' ? '登录并同步' : '注册账号'}
          </button>
          {mode === 'in' && (
            <button className="mt-2 w-full text-center text-[11px] text-teal" data-testid="auth-forgot" onClick={doReset}>
              忘记密码？发送重置邮件
            </button>
          )}
          <p className="mt-2 text-[12px] leading-relaxed text-muted">首次登录会以云端数据为准；若云端为空，则用当前本地数据初始化云端。</p>
        </div>
      )}
    </Modal>
  )
}
