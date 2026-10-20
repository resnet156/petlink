import { useStore } from '@/store/useStore'
import { ensureNotificationPermission, notificationPermission, notificationsSupported } from '@/lib/notify'
import { pushSupported, sendTestPush } from '@/lib/push'
import { Icon, type IconName } from '@/components/Icon'

type Group = '家庭与设备' | '宠物安全' | '互动与陪伴'
const ITEMS: { icon: IconName; title: string; desc: string; modal: any; link: string; group: Group }[] = [
  { icon: 'mapManage', title: '家庭地图', desc: '上传户型、手绘或扫描，并绑定各房间设备。', modal: 'mapBuilder', link: '管理地图 →', group: '家庭与设备' },
  { icon: 'devices', title: '设备管理', desc: '摄像头、音箱、屏幕、喂食器和空调绑定状态。', modal: 'device', link: '查看设备 →', group: '家庭与设备' },
  { icon: 'automation', title: '全屋自动联动', desc: '配置温湿度、摄像头接力与互动触发规则。', modal: 'automation', link: '管理规则 →', group: '家庭与设备' },
  { icon: 'fence', title: '虚拟栅栏', desc: '设置室内安全区域，离开范围时接收提醒。', modal: 'fence', link: '安全区域 →', group: '宠物安全' },
  { icon: 'lost', title: '走失互寻', desc: '共享定位、发布寻宠动态并提醒附近会员。', modal: 'lost', link: '走失模式 →', group: '宠物安全' },
  { icon: 'chat', title: '宠物对话框', desc: '用消息流承载找主人、语音、行为与互动事件。', modal: 'chat', link: '打开对话 →', group: '互动与陪伴' },
  { icon: 'voice', title: '主人声音', desc: '录制声线并在音箱 / 智能屏远程播放。', modal: 'voice', link: '声音调教 →', group: '互动与陪伴' },
  { icon: 'friends', title: '毛茸茸好友', desc: '添加附近宠友，并可向对方主人发起联系。', modal: 'friends', link: '附近好友 →', group: '互动与陪伴' },
  { icon: 'desktop', title: '桌面组件', desc: '把宠物和 3D 房间作为桌面小组件常驻屏幕，实时移动。', modal: 'desktopWidget', link: '获取组件 →', group: '互动与陪伴' },
]
const GROUP_ORDER: Group[] = ['家庭与设备', '宠物安全', '互动与陪伴']

export function MePage() {
  const openModal = useStore((s) => s.openModal)
  const pet = useStore((s) => s.pet)
  const resetDemo = useStore((s) => s.resetDemo)
  const toast = useStore((s) => s.toast)

  const enableNotify = async () => {
    if (!notificationsSupported()) return toast('warn', '当前浏览器不支持通知')
    const ok = await ensureNotificationPermission()
    toast(ok ? 'success' : 'warn', ok ? '已开启通知：走失/铃铛/陪伴提醒会推送' : '通知未授权，可在浏览器设置中开启')
  }

  const testPush = async () => {
    if (!pushSupported()) return toast('warn', '当前环境不支持消息通知（需 https 部署且浏览器支持）')
    const ok = await ensureNotificationPermission()
    if (!ok) return toast('warn', '请先授权通知')
    try {
      const sent = await sendTestPush({ title: 'PetLink 测试通知', body: '这是一条来自服务器的消息通知 🐾', url: '/' })
      toast(sent ? 'success' : 'error', sent ? '已发送，稍候将收到系统通知' : '发送失败（服务端未配置或网络问题）')
    } catch {
      toast('error', '通知发送失败')
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <div className="eyebrow">MY PETLINK</div>
          <h2 className="my-1 text-3xl font-extrabold">我的</h2>
          <div className="text-sm text-muted">家庭地图、守护、安全与社交能力设置。</div>
        </div>
        <span className="badge">{pet.name} · 在线</span>
      </div>

      <div className="flex flex-col gap-6">
        {GROUP_ORDER.map((g) => (
          <section key={g} data-testid={`me-group-${g}`}>
            <div className="eyebrow mb-2.5">{g}</div>
            <div className="grid grid-cols-3 gap-3.5 max-[900px]:grid-cols-2 max-[640px]:grid-cols-1">
              {ITEMS.filter((it) => it.group === g).map((it) => (
                <button key={it.title} onClick={() => openModal(it.modal)} className="min-h-[150px] rounded-2xl border border-line bg-white p-5 text-left shadow-softsm transition hover:-translate-y-0.5">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-teal-soft text-teal">
                    <Icon name={it.icon} size={22} />
                  </div>
                  <h4 className="my-3 text-base font-bold">{it.title}</h4>
                  <p className="min-h-[38px] text-sm leading-relaxed text-muted">{it.desc}</p>
                  <span className="text-xs font-bold text-teal">{it.link}</span>
                </button>
              ))}
            </div>
          </section>
        ))}

        <section data-testid="me-group-个人设置">
          <div className="eyebrow mb-2.5">个人设置</div>
          <div className="card flex items-center justify-between">
            <div>
              <b className="text-sm">通知与安装</b>
              <p className="mt-1 text-xs text-muted">开启通知后，走失告警 / 找主人铃铛 / 陪伴提醒会推送到系统通知栏。在浏览器菜单选择“添加到主屏幕 / 安装应用”即可把 PetLink 装到桌面。</p>
            </div>
            <button className="btn btn-primary whitespace-nowrap" data-testid="enable-notify" onClick={enableNotify}>
              {notificationPermission() === 'granted' ? '通知已开启' : '开启通知'}
            </button>
          </div>

          <div className="card mt-4 flex items-center justify-between">
            <div>
              <b className="text-sm">消息通知</b>
              <p className="mt-1 text-xs text-muted">开启后，走失 / 找人 / 陪伴提醒会推送到系统通知栏，应用在后台或关闭也能收到。点击发送一条测试通知。</p>
            </div>
            <button className="btn whitespace-nowrap" data-testid="test-push" onClick={testPush}>发送测试通知</button>
          </div>

          <div className="card mt-4 flex items-center justify-between">
            <div>
              <b className="text-sm">数据与演示</b>
              <p className="mt-1 text-xs text-muted">所有编辑（户型/设备/规则/围栏/语音）已持久化到本地。可一键恢复演示数据。</p>
            </div>
            <button className="btn btn-red whitespace-nowrap" data-testid="reset-demo" onClick={() => { if (confirm('确定恢复演示数据？当前所有本地编辑将被重置。')) resetDemo() }}>恢复演示数据</button>
          </div>
        </section>
      </div>
    </div>
  )
}
