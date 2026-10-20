import { test, expect, type Page } from '@playwright/test'

async function gotoFresh(page: Page) {
  // 每个测试用例是独立 context，localStorage 本身为空；不在此清理，以免影响 reload 后的持久化断言
  await page.goto('/')
  await expect(page.getByTestId('nav-home')).toBeVisible()
}

test('演示功能默认隐藏，开启演示模式后出现并有标识', async ({ page }) => {
  await gotoFresh(page)
  await page.getByTestId('nav-map').click()
  await expect(page.getByTestId('sim-next-room')).toHaveCount(0)
  await expect(page.getByTestId('demo-mode-badge')).toHaveCount(0)
  await page.getByTestId('demo-mode-toggle').click()
  await expect(page.getByTestId('demo-mode-badge')).toBeVisible()
  await expect(page.getByTestId('sim-next-room')).toBeVisible()
  await expect(page.getByTestId('demo-panel')).toBeVisible()
})

test('摄像头预览标注“演示画面”而非 LIVE', async ({ page }) => {
  await gotoFresh(page)
  await page.getByTestId('nav-map').click()
  const preview = page.getByTestId('side-camera-preview')
  await expect(preview).toBeVisible()
  await expect(preview).toContainText('演示画面')
  await expect(preview).not.toContainText('LIVE')
})

test('寻宠卡片按资料生成并可上传照片', async ({ page }) => {
  await gotoFresh(page)
  await page.getByTestId("demo-mode-toggle").click()
  await page.getByTestId('demo-panel').waitFor()
  await page.getByRole('button', { name: '围栏告警' }).click()
  await expect(page.getByTestId('lost-modal')).toBeVisible()
  await page.getByRole('button', { name: /放大预览/ }).click()
  await expect(page.getByTestId('share-card-modal')).toBeVisible()
  await expect(page.getByTestId('share-card-modal')).toContainText('依据宠物资料')
  await expect(page.getByTestId('share-upload-photo')).toBeVisible()
})

test('远程投喂：确认克数 → 执行中 → 执行成功（闭环反馈）', async ({ page }) => {
  await gotoFresh(page)
  await page.getByTestId('nav-map').click()
  await page.getByTestId('home-iso-svg').waitFor()
  await page.getByTestId('map-device-feeder').first().click({ force: true })
  await expect(page.getByTestId('device-control-modal')).toBeVisible({ timeout: 2000 })
  await expect(page.getByTestId('feed-portions')).toBeVisible()
  await page.getByRole('button', { name: '12g' }).click()
  await page.getByTestId('feed-confirm').click()
  await expect(page.getByTestId('device-op')).toContainText('执行成功', { timeout: 3000 })
})

test('删除房间需二次确认（可取消/可撤销）', async ({ page }) => {
  await gotoFresh(page)
  await page.getByTestId('nav-map').click()
  await page.getByTestId('edit-map-btn').click()
  await expect(page.getByTestId('map-builder-modal')).toBeVisible()
  const before = await page.getByTestId('room-row').count()
  await page.getByTestId('room-del').first().click()
  const confirm = page.getByTestId('room-del-confirm')
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: '取消' }).click()
  await expect(page.getByTestId('room-row')).toHaveCount(before)
  await page.getByTestId('room-del').first().click()
  await page.getByTestId('room-del-ok').click()
  await expect(page.getByTestId('room-row')).toHaveCount(before - 1)
})

test('地图设备模式显示设备状态（与实时模式内容不同）', async ({ page }) => {
  await gotoFresh(page)
  await page.getByTestId('nav-map').click()
  await page.getByTestId('home-iso-svg').waitFor()
  await expect(page.getByTestId('home-iso-svg')).not.toContainText('余粮')
  await page.getByTestId('map-mode-devices').click()
  await expect(page.getByTestId('home-iso-svg')).toContainText('余粮')
})

test('记录页时间筛选（今天/近7天/本月）真实改变数据', async ({ page }) => {
  await gotoFresh(page)
  await page.getByTestId('nav-records').click()
  const count = page.getByTestId('records-count')
  await expect(count).toBeVisible()
  const read = async () => Number((await count.innerText()).replace(/\D/g, ''))
  const today = await read()
  await page.getByTestId('range-7d').click()
  const d7 = await read()
  await page.getByTestId('range-month').click()
  const month = await read()
  expect(d7).toBeGreaterThan(today)
  expect(month).toBeGreaterThanOrEqual(d7)
})

test('移动端(390px)无横向滚动、导航可用、Esc 关闭弹层', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await gotoFresh(page)
  for (const nav of ['nav-home', 'nav-map', 'nav-records', 'nav-me']) {
    await page.getByTestId(nav).click()
    await page.waitForTimeout(150)
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
    expect(o.sw).toBeLessThanOrEqual(o.cw + 1)
  }
  // Esc 关闭弹层
  await page.getByTestId('account-btn').click()
  await expect(page.getByTestId('auth-modal')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('auth-modal')).toBeHidden()
})

test('“我的”页按类别分组 + 围栏可从地图页进入', async ({ page }) => {
  await gotoFresh(page)
  await page.getByTestId('nav-me').click()
  await expect(page.getByTestId('me-group-家庭与设备')).toBeVisible()
  await expect(page.getByTestId('me-group-宠物安全')).toBeVisible()
  await expect(page.getByTestId('me-group-互动与陪伴')).toBeVisible()
  await expect(page.getByTestId('me-group-个人设置')).toBeVisible()
  await page.getByTestId('nav-map').click()
  await page.getByTestId('map-fence-btn').click()
  await expect(page.getByTestId('fence-modal')).toBeVisible()
})

test('浮窗模式仅显示户型地图（无主导航）', async ({ page }) => {
  await page.goto('/?mini=1')
  await expect(page.getByTestId('mini-exit')).toBeVisible()
  await expect(page.getByTestId('nav-home')).toHaveCount(0)
})

test('桌面组件：从我的页和首页均可打开下载选择', async ({ page }) => {
  await gotoFresh(page)
  // 我的页卡片入口
  await page.getByTestId('nav-me').click()
  await page.getByRole('button', { name: /桌面组件/ }).click()
  await expect(page.getByTestId('desktop-widget-modal')).toBeVisible()
  await expect(page.getByTestId('desktop-all-versions')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('desktop-widget-modal')).toBeHidden()
  // 首页入口
  await page.getByTestId('nav-home').click()
  await page.getByTestId('home-desktop-widget').click()
  await expect(page.getByTestId('desktop-widget-modal')).toBeVisible()
  // 三平台下载入口齐全
  await expect(page.getByTestId('desktop-dl-mac')).toBeVisible()
  await expect(page.getByTestId('desktop-dl-win')).toBeVisible()
  await expect(page.getByTestId('desktop-dl-linux')).toBeVisible()
})

test('完整应用 ↔ 组件视图可在同一窗口互相切换，组件内可开摄像头', async ({ page }) => {
  await gotoFresh(page)
  // 首页入口 → 弹窗 → 切换到组件视图
  await page.getByTestId('home-desktop-widget').click()
  await page.getByTestId('switch-to-widget').click()
  await expect(page.getByTestId('mini-widget')).toBeVisible()
  await expect(page.getByTestId('nav-home')).toHaveCount(0)
  // 组件内可直接打开对应摄像头画面
  await page.getByTestId('mini-camera').click({ force: true })
  await expect(page.getByTestId('camera-float')).toBeVisible()
  await page.getByTestId('camera-float-close').click()
  // 关闭(×) = 关闭地图视图回到完整应用（不退出程序）
  await page.getByTestId('mini-exit').click({ force: true })
  await expect(page.getByTestId('nav-home')).toBeVisible()
  // 再次进入组件，放大(⤢) → 完整应用的地图页
  await page.getByTestId('home-desktop-widget').click()
  await page.getByTestId('switch-to-widget').click()
  await page.getByTestId('mini-expand').click({ force: true })
  await expect(page.getByTestId('nav-home')).toBeVisible()
  await expect(page.getByTestId('home-iso-svg').or(page.getByTestId('live-map-svg'))).toBeVisible()
})

test('桌面组件仅显示 3D 房间与宠物（无边框/无其他元素）', async ({ page }) => {
  await page.goto('/?mini=1')
  // 只有 3D 房间 + 宠物
  await expect(page.getByTestId('mini-3d-room')).toBeVisible()
  await expect(page.getByTestId('mini-3d-room').locator('svg').first()).toBeVisible()
  // 无浏览器式 chrome：无风格切换 / 无 3D·平面 toggle
  await expect(page.getByTestId('mini-style-switch')).toHaveCount(0)
  await expect(page.getByTestId('mini-view-toggle')).toHaveCount(0)
})

test('首页上传宠物照片后地图沿用', async ({ page }) => {
  const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  await gotoFresh(page)
  await page.getByTestId('home-photo-input').setInputFiles({ name: 'cat.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') })
  await expect(page.locator('img[alt="毛球"]').first()).toBeVisible({ timeout: 4000 })
  await page.getByTestId('nav-map').click()
  await expect(page.getByTestId('pet-avatar').locator('img')).toBeVisible()
})

test('首页显示守护对象并可切换宠物', async ({ page }) => {
  await gotoFresh(page)
  await expect(page.getByText('今日守护对象')).toBeVisible()
  const switcher = page.getByTestId('home-pet-switcher')
  await expect(switcher).toBeVisible()
  await expect(page.getByRole('heading', { name: '毛球', level: 2 })).toBeVisible()
  await switcher.getByRole('button', { name: '团子' }).click()
  await expect(page.getByRole('heading', { name: '团子', level: 2 })).toBeVisible()
})

test('地图页显示右侧实时信息面板与客厅', async ({ page }) => {
  await gotoFresh(page)
  await page.getByTestId('nav-map').click()
  await expect(page.getByTestId('map-side-panel')).toBeVisible()
  await expect(page.getByTestId('tracking-room')).toHaveText('客厅')
})

test('编辑已有房间加顶点 + 新增房间 + 应用 + 刷新持久化', async ({ page }) => {
  await gotoFresh(page)
  await page.getByTestId('nav-map').click()
  await page.getByTestId('edit-map-btn').click()
  await expect(page.getByTestId('map-builder-modal')).toBeVisible()

  // 选中已有第一个房间 → 出现单房间编辑器 → 加转角
  await page.getByTestId('room-row').first().click()
  await expect(page.getByTestId('room-inspector')).toBeVisible()
  await page.getByTestId('add-vertex').click()

  // 新增房间并重命名
  await page.getByRole('button', { name: '＋ 房间' }).first().click()
  const nameInputs = page.locator('[data-testid="room-row"] input')
  await nameInputs.last().fill('宠物房')

  // 应用到实时地图
  await page.getByTestId('apply-map').click()
  await expect(page.getByTestId('map-builder-modal')).toBeHidden()
  // 地图上出现新房间标签
  await expect(page.getByTestId('home-iso-svg')).toContainText('宠物房')

  // 刷新后仍保留“宠物房”
  await page.reload()
  await page.getByTestId('nav-map').click()
  await expect(page.getByTestId('home-iso-svg')).toContainText('宠物房')
})

test('模拟跨房间：位置更新 + 接力 + 追踪卡变化', async ({ page }) => {
  await gotoFresh(page)
  await page.getByTestId('nav-map').click()
  await page.getByTestId('demo-mode-toggle').click() // 开启演示模式以显示模拟按钮
  await expect(page.getByTestId('tracking-room')).toHaveText('客厅')
  await page.getByTestId('sim-next-room').click()
  // 位置应变化（不再是客厅）
  await expect(page.getByTestId('tracking-room')).not.toHaveText('客厅', { timeout: 5000 })
})

test('环境联动：高温出现建议卡并可确认开空调', async ({ page }) => {
  await gotoFresh(page)
  await page.getByTestId('nav-map').click()
  await page.getByTestId("demo-mode-toggle").click()
  await expect(page.getByTestId('demo-panel')).toBeVisible()
  // 当前房间(客厅)设为高温
  await page.getByRole('button', { name: '高温' }).click()
  // 关闭演示面板，避免遮挡建议卡按钮
  await page.getByTestId("demo-mode-toggle").click()
  await expect(page.getByTestId('demo-panel')).toBeHidden()
  await expect(page.getByTestId('suggestion-card')).toBeVisible()
  await page.getByTestId('suggestion-card').getByRole('button', { name: '开启空调' }).click()
  await expect(page.getByTestId('toast')).toContainText('空调')
})

test('虚拟围栏同步当前地图版本并可保存', async ({ page }) => {
  await gotoFresh(page)
  await page.getByTestId('nav-me').click()
  await page.getByRole('button', { name: /虚拟栅栏/ }).click()
  await expect(page.getByTestId('fence-modal')).toBeVisible()
  await expect(page.getByTestId('fence-sync-badge')).toContainText('房间')
  await page.getByTestId('save-fence').click()
  await expect(page.getByTestId('toast')).toContainText('虚拟栅栏已保存')
})

test('铃铛找人进入对话框并可发送 + 立即看它', async ({ page }) => {
  await gotoFresh(page)
  await page.getByTestId('nav-me').click()
  await page.getByRole('button', { name: /宠物对话框/ }).click()
  await expect(page.getByTestId('chat-modal')).toBeVisible()
  await page.getByTestId('bell-btn').click()
  await expect(page.getByTestId('bell-event').last()).toBeVisible()
  await page.getByTestId('chat-input').fill('毛球我马上回家')
  await page.getByTestId('chat-send').click()
  await expect(page.getByTestId('observe-after-send')).toBeVisible({ timeout: 3000 })
  await page.getByTestId('observe-after-send').getByRole('button').click()
  await expect(page.getByTestId('camera-modal')).toBeVisible()
})

test('宠物主动找人展示完整链路（设备播报→推送主人→可回应）', async ({ page }) => {
  await gotoFresh(page)
  await page.getByTestId('nav-me').click()
  await page.getByRole('button', { name: /宠物对话框/ }).click()
  await page.getByTestId('bell-btn').click()
  const chain = page.getByTestId('find-owner-chain')
  await expect(chain).toBeVisible()
  await expect(chain).toContainText('播报提示')
  await expect(chain).toContainText('已推送到你的手机')
  await expect(page.getByTestId('chain-peek')).toBeVisible({ timeout: 4000 })
  await page.getByTestId('chain-peek').click()
  await expect(page.getByTestId('camera-modal')).toBeVisible()
})

test('历史模式绘制轨迹', async ({ page }) => {
  await gotoFresh(page)
  await page.getByTestId('nav-map').click()
  await page.getByTestId('map-mode-history').click()
  await expect(page.getByText('今日停留热点')).toBeVisible()
})

test('历史节点可点击查看事件 + 实时模式不显示历史 Avatar', async ({ page }) => {
  await gotoFresh(page)
  await page.getByTestId('nav-map').click()
  await page.getByTestId('map-mode-history').click()
  // 历史模式不展示实时 Avatar
  await expect(page.getByTestId('pet-avatar')).toHaveCount(0)
  // 点击轨迹节点打开对应事件
  await page.getByTestId('history-node').first().click({ force: true })
  await expect(page.getByTestId('event-modal')).toBeVisible()
})

test('点击另一只宠物 Avatar 切换右侧面板', async ({ page }) => {
  await gotoFresh(page)
  await page.getByTestId('nav-map').click()
  await expect(page.getByTestId('tracking-room')).toHaveText('客厅')
  await page.getByTestId('pet-avatar-other').first().click({ force: true })
  await expect(page.getByTestId('tracking-room')).toHaveText('卧室')
})

test('情绪陪伴：开启后可触发温和提醒，非诊断', async ({ page }) => {
  await gotoFresh(page)
  await page.getByTestId('demo-mode-toggle').click() // 情绪偏低模拟按钮属演示能力
  await page.getByTestId('nav-records').click()
  await page.getByTestId('companion-toggle').click()
  await page.getByTestId('low-mood-btn').click()
  await expect(page.getByTestId('emotion-push')).toBeVisible()
  await expect(page.getByTestId('emotion-signal')).toContainText('不作健康判断')
})

test('多宠物：切换宠物后追踪卡随之更新', async ({ page }) => {
  await gotoFresh(page)
  await page.getByTestId('nav-map').click()
  await expect(page.getByTestId('pet-switcher')).toBeVisible()
  await expect(page.getByTestId('tracking-room')).toHaveText('客厅')
  // 切到第二只（团子 · 卧室）
  await page.getByTestId('pet-switcher').getByRole('button', { name: '团子' }).click()
  await expect(page.getByTestId('tracking-room')).toHaveText('卧室')
})

test('点击 Avatar 弹出快捷互动气泡（核心交互）', async ({ page }) => {
  await gotoFresh(page)
  await page.getByTestId('nav-map').click()
  await page.getByTestId('pet-avatar').click({ force: true })
  await expect(page.getByTestId('avatar-popover')).toBeVisible()
  await expect(page.getByTestId('avatar-popover')).toContainText('看视频')
})

test('户型编辑器可布置家具（添加后可删除）', async ({ page }) => {
  await gotoFresh(page)
  await page.getByTestId('nav-map').click()
  await page.getByTestId('edit-map-btn').click()
  await page.getByTestId('room-row').first().click()
  await page.getByTestId('tool-furniture').click()
  await page.getByRole('button', { name: '＋ 沙发' }).click()
  // 新增家具会被选中 → 出现删除按钮
  await expect(page.getByTestId('furn-delete')).toBeVisible()
})

test('账号入口可打开账号与云端同步弹层', async ({ page }) => {
  await gotoFresh(page)
  await page.getByTestId('account-btn').click()
  await expect(page.getByTestId('auth-modal')).toBeVisible()
  // 视是否配置 Supabase：显示登录表单 或 本地模式提示，二者其一即通过
  await expect(page.getByTestId('auth-modal')).toContainText(/账号与云端同步/)
  const cloud = await page.getByTestId('auth-email').count()
  const local = await page.getByTestId('auth-modal').getByText('云端未配置').count()
  expect(cloud + local).toBeGreaterThan(0)
})

test('双击地图摄像头图标打开可观看浮窗并可关闭', async ({ page }) => {
  await gotoFresh(page)
  await page.getByTestId('nav-map').click()
  await page.getByTestId('home-iso-svg').waitFor()
  await page.getByTestId('map-camera').first().dblclick({ force: true })
  await expect(page.getByTestId('camera-float')).toBeVisible()
  await page.getByTestId('camera-float-close').click()
  await expect(page.getByTestId('camera-float')).toBeHidden()
})

test('宠物气泡“看看它”复用同一摄像头浮窗（看最近摄像头）', async ({ page }) => {
  await gotoFresh(page)
  await page.getByTestId('nav-map').click()
  await page.getByTestId('pet-avatar').click({ force: true })
  await expect(page.getByTestId('avatar-popover')).toBeVisible()
  await page.getByTestId('avatar-popover').getByRole('button', { name: /看视频/ }).click()
  await expect(page.getByTestId('camera-float')).toBeVisible()
  await expect(page.getByTestId('camera-float')).toHaveCount(1)
})
