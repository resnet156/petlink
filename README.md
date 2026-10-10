# PetLink × 小度 · 全屋宠物陪伴 Web App

## 真实项圈 MVP（2026-10-10）

本分支新增 M5Capsule 六轴采集 → HTTPS 鉴权上传 → SQLite 持久化 → 规则运动识别 → Three.js 3D 宠物联动。
默认入口是「真实项圈」。原有首页、地图和生活记录保留为产品演示；真实六轴数据不提供室内定位、电量、进食、睡眠或情绪结论。

- [运行、协议、部署和回滚](docs/HARDWARE_MVP.md)
- [开源方案调研与推理条件](docs/opensource-research.md)
- [固件与设备网关](https://github.com/resnet156/petlink-firmware)（独立私有仓库）

四类照片/视频入口已接入真实云任务：宠物使用开源 TripoSR 生成带纹理 GLB；室内使用 Depth Anything V2 Small 生成可见表面的相对深度网格。推理在 Mac MPS 节点运行，项圈通过 Wi-Fi 独立联网。网页复用 Three.js 官方环境光照、接触阴影与镜头控制。
完整准确户型、视频多视图融合和宠物专属骨骼尚未完成；人工尺寸 2D/3D 房间保留辅助入口。详细范围和使用方法见上方运行文档。

以下内容保留上游产品原型的说明和历史验收，仅适用于对应演示功能，不代表新增硬件功能已经完成相同验收。

> PetLink 是一个面向人宠分离场景的全屋宠物陪伴 Web 应用。它以家庭地图中的实时宠物 Avatar 为核心，将多摄像头、项圈定位、环境传感器与小度智能设备统一到同一空间模型中，让用户随时知道宠物在哪里、在做什么，并可一键看它、叫它、陪它、投喂或调动所在房间设备；宠物跨房间时持续追踪并完成摄像头接力，全天活动则自动沉淀为宠物踪迹与 AI 宠物日记。

本项目基于交互原型 `petlink_pet_companion_prototype_v4.html`（仅作视觉 / 信息架构 / 交互意图参考）重新实现为组件化、可部署、可迭代的 Web App。**所有模块共享同一份 `HomeMap / Device / PetState / PetEvent` 状态与数据模型**，绝非把单文件 HTML 塞进 React。

## 技术栈

- Vite + React 18 + TypeScript（SPA，无 SSR，因此不存在 hydration 问题）
- Zustand + `persist` 中间件（localStorage 持久化，带 `schemaVersion`）
- IndexedDB（`idb-keyval`）保存用户上传的户型底图
- 原生 SVG 负责家庭地图 / 房间多边形 / 围栏 / 轨迹；Canvas 负责户型手绘编辑器与寻宠卡片
- CSS transition 负责 Avatar 跨房间平滑动画
- Vitest（单元测试）+ Playwright（E2E）
- 可部署到 Vercel / Netlify / Cloudflare Pages（已提供 `vercel.json`）

> 说明：需求文档推荐 Next.js，本实现选用 Vite SPA。二者都满足“组件化 / 单一状态源 / 可部署 / localStorage+IndexedDB 持久化”的全部硬性要求；纯前端 + 本地持久化场景下 Vite SPA 更轻、构建更快，且天然规避 SSR hydration 一致性问题。

## 本地运行

```bash
npm install
npm run dev          # 开发服务器 http://localhost:5173（演示控制台默认开启）
```

## 生产构建

```bash
npm run build        # tsc 类型检查 + vite 生产构建，产物在 dist/
npm run preview      # 本地预览生产构建
```

## 测试

```bash
npm test             # Vitest 单元测试（几何 / 追踪 / store 状态机）
npx playwright install chromium   # 首次需安装浏览器
npm run test:e2e     # Playwright E2E（核心链路 + 全流程 0 console error 守卫）
```

## 部署

- Vercel：导入仓库即可，`vercel.json` 已配置 `buildCommand=npm run build`、`outputDirectory=dist`、SPA 回退 rewrite。
- Netlify / Cloudflare Pages：构建命令 `npm run build`，发布目录 `dist`，并将所有路由回退到 `/`（本应用为单路由 SPA）。

<!-- APPEND_MARKER -->

## 唯一数据源与目录结构

所有功能读取同一份状态（`src/store/useStore.ts`）：`HomeMap`（含 `Room[]`）、`Device[]`、`PetState`、`PetEvent[]`、`Fence`、`AutomationRule[]`、`ChatMessage[]`、`VoicePreset`、`LostMode`。任何地图 / 设备 / 围栏修改保存后，实时地图、追踪、摄像头、围栏、历史、演示控制台立即同步。

```
src/
├── domain/          领域模型与纯函数
│   ├── types.ts       HomeMap / Room / Device / PetState / PetEvent 等全部类型
│   ├── geometry.ts    多边形 / 质心 / 命中检测 / 最近设备房间 / 围栏贴合
│   └── seed.ts        默认户型、设备、宠物、规则、事件（schemaVersion）
├── adapters/        Adapter 接口层（未来接真实小度 IoT 只替换实现）
│   ├── types.ts       Hardware / Tracking / Camera / Recognition / Emotion / VoiceClone 接口
│   └── mock.ts        全部 Mock 实现
├── store/
│   ├── useStore.ts    Zustand 全局状态 + 全部动作 + 跨房间/接力时序状态机
│   └── imageStore.ts  IndexedDB 户型底图存取
├── lib/             tracking（接力文案/来源）、diary（日记/停留占比）、time、shareCard
├── components/      LiveMap / TrackingCard / SuggestionCard / TrailDrawer / DemoPanel / PetSvg / Modal / Toaster
├── modals/          户型编辑器（含 canvas 顶点编辑）、摄像头、围栏、走失、语音、对话、自动化、设备控制等
└── pages/           HomePage / MapPage / RecordsPage / MePage
```

## 数据持久化与 Schema 版本

- localStorage key：`petlink-store`，`version = SCHEMA_VERSION`（见 `src/domain/seed.ts`）。
- 版本不一致时自动丢弃旧数据回落到 seed（`migrate`），避免结构错乱。
- 户型底图存 IndexedDB（`petlink:floorplan:*`）。
- 刷新页面后用户编辑过的户型 / 设备绑定 / 规则 / 围栏 / 语音预设均保留。
- “我的 → 恢复演示数据”一键 reset。

## Mock 说明（重要）

当前版本以下能力均为 **Mock**，UI 明确以“指令已发送”表述，不代表设备真的执行成功，也不伪造 AI/克隆结果：

- 硬件控制 `mockHardwareAdapter.sendCommand`：返回“已受理”，可通过 deviceId 后缀 `__reject` 模拟被拒绝错误态。
- 追踪 / 跨房间 / 摄像头接力：`store` 内 mock 状态机（camera lost → BLE/IMU → searching → detected/no_camera）。
- 声音 / 动作识别：mock 事件。
- 主人声音：真实调用浏览器 `MediaRecorder` 录音并保存原始录音；**不做声线克隆**（`mockVoiceCloneAdapter.cloned=false`），预留 `voiceCloneAdapter` 接入点。
- 情绪陪伴：仅在用户主动开启后生成“温和陪伴线索/提醒”，**不作任何健康或心理诊断**。

## 真实 API 接入点

替换 `src/adapters/*` 中对应 Adapter 实现即可对接真实小度 IoT / AI：
`HardwareAdapter`（设备指令）、`TrackingAdapter`（项圈/视觉定位）、`CameraAdapter`（摄像头列表严格来自 HomeMap+Device 绑定 / 拉流）、`RecognitionAdapter`（行为/声音事件）、`EmotionCompanionAdapter`（陪伴线索）、`VoiceCloneAdapter`（声线克隆）。UI 与 store 只依赖接口，无需改动。

## 账号与云端同步（Supabase）

应用默认**纯本地模式**（数据存浏览器，无需登录即可用）。配置 Supabase 后即可开启账号登录与多设备云端同步：

1. 在 https://supabase.com 新建项目。
2. Project Settings → API，复制 `Project URL` 与 `anon public key`。
3. 在 Supabase SQL Editor 执行本仓库 `supabase/schema.sql`（建 `app_state` 表 + 行级安全 RLS + 实时发布）。
4. 配置环境变量（本地写入 `.env`，线上写入 Vercel 环境变量）：
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGci...
   ```
5. 重新构建部署。右上角 ☁/⇲ 账号按钮即可注册 / 登录。

同步策略：登录后**云端有数据以云端为准**（跨设备共享），云端为空则用当前本地数据初始化云端；此后本地任何领域数据变化都会防抖上传，并通过 Supabase Realtime 接收其它设备的变更（`last-write-wins`，整份快照 + version）。anon key 是公开前端密钥，数据访问受 RLS 保护，用户只能读写自己的行。

代码位置：`src/lib/supabase.ts`（客户端）、`src/store/useAuth.ts`（认证 + 家庭共享）、`src/lib/cloudSync.ts`（拉取/推送/实时）、`src/modals/AuthModal.tsx`（登录 / 忘记密码 / 家庭共享 UI）。

### 忘记密码
登录框「忘记密码？」→ 发送重置邮件；点邮件链接回到应用会触发 `PASSWORD_RECOVERY`，自动弹出「设置新密码」。需在 Supabase → Authentication → URL Configuration 把站点地址加入 Redirect 允许列表。

### 多宠物
默认内置两只宠物（毛球 / 团子）。地图会为每只渲染独立 Avatar（同房间自动错开），点击 Avatar 或追踪卡上的宠物名可切换当前宠物；在 Avatar 面板可添加 / 重命名 / 删除宠物。跨房间、追踪、接力、事件均针对“当前选中宠物”。

### 家庭共享（多人一个家）
登录后在账号弹层可复制自己的「家庭 ID」发给家人；家人粘贴后即加入、共享同一份宠物/户型/事件数据（基于 `home_members` 表 + RLS，成员可读写 owner 的 `app_state` 行）。**需先执行更新后的 `supabase/schema.sql`（新增 home_members 表并更新 app_state 策略）**。

## PWA 安装与通知

- 已通过 `vite-plugin-pwa` 生成 `manifest.webmanifest` + Service Worker（离线缓存应用外壳、版本更新提示）。
- 桌面/移动浏览器可“添加到主屏幕 / 安装应用”，独立窗口运行；也会在检测到可安装时弹出安装条。
- 我的页「开启通知」授权后，走失告警 / 找主人铃铛 / 陪伴提醒会通过系统通知栏推送（`src/lib/notify.ts` + SW `showNotification`）。
- 说明：当前为**应用内触发的本地通知**（应用在前台/后台均可弹）。真正“应用完全关闭时由服务器主动推送”需 Web Push（VAPID 密钥 + 推送后端），已预留改造点。
- 注意：Service Worker 仅在生产构建（`npm run build && npm run preview`）或 https 部署下启用；开发模式默认关闭以免干扰调试。

## 演示控制台

开发环境或 `?demo=1` 时，右上角 ⚙ 打开演示控制台。它基于真实 app state 触发：宠物位置（真实跨房间）、行为、单房间温湿度、找主人铃铛、围栏告警、摄像头接力、情绪陪伴线索、进食/声音事件。所有事件正常进入 PetState / PetEvent / Trail / Handoff / Diary。生产构建默认隐藏。

## 已知限制

- 数据存储：默认纯本地（localStorage + IndexedDB）；配置 Supabase 后支持账号登录与多设备云端同步（见上文）。未配置时换设备 / 清缓存不保留。
- 硬件 / AI / 定位 / 声线克隆均为 Mock，见上文。
- 户型上传底图仅作手绘编辑的参考底图，不做图像识别自动分房间；扫描为 mock 生成默认房间。
- 桌面端优先；≤1024px 做了基本适配但非移动端精细优化。
- Web Share API 仅在支持的浏览器（多为移动端）可用，否则回退为导出 PNG。

## QA 验收结果（对应需求文档第 32 节，全部 P0 PASS）

| # | 测试项 | 预期 | 实际 | 结果 |
|---|---|---|---|---|
| 1 | 打开默认户型 | 5 个房间 + 客厅 Avatar | 一致 | PASS |
| 2-3 | 编辑客厅：拖动整房 / 拖动墙角 | 房间整体移动、单顶点可拖动 | select 工具支持整房拖动与绿色顶点拖动 | PASS |
| 4 | 给房间加顶点形成非矩形 | 新增可拖动转角 | Inspector「＋ 添加转角」+ 顶点拖动 | PASS |
| 5-6 | 新增“宠物房”并重命名/调整大小 | 可新增/命名/缩放 | 支持 | PASS |
| 7 | 给宠物房绑定摄像头/音箱 | 绑定 tab 可改设备房间 | 支持（双向一致） | PASS |
| 8-9 | 应用地图 + 刷新仍存在 | 持久化 | localStorage 持久化，E2E 覆盖 | PASS |
| 10-13 | 移动到宠物房 / 跨到客厅 / 过渡动画 / 追踪卡更新 | 平滑移动+奔跑+追踪卡同步 | 浏览器实测 route/running/接力完成/置信度更新 | PASS |
| 14-15 | 摄像头接力 / 摄像头列表含新房间 | 接力阶段展示 + 动态列表 | 接力文案分阶段；列表来自 Device 绑定 | PASS |
| 16-18 | 客厅温度 30℃ / 出现联动建议 / 控制客厅自己的空调 | 单房间环境 + 就近空调 | 建议卡出现，turnOnAC 定位本房间/最近空调 | PASS |
| 19-21 | 打开围栏 / 显示最新户型 / 改顶点保存 | 同步同一 HomeMap + version | fence 读取当前 rooms，显示 V 号，可保存 | PASS |
| 22-26 | 触发铃铛 / 进对话框 / 主人回应 / 立即看它 / 跳摄像头 | 统一消息流 + 一键看它 | E2E 覆盖，跳转摄像头 | PASS |
| 27-28 | 历史模式 / 地图出现轨迹 | 绘制跨房间轨迹 + 停留热点 | history-route + 停留占比 | PASS |
| 29-30 | 情绪陪伴线索 / 温和提醒非诊断 | 温和提醒，不作诊断 | 文案“不作健康判断”，需用户授权 | PASS |

浏览器 Console 校验：全流程点击 **0 个未处理 runtime error / 0 pageerror**（`e2e/console.spec.ts` 守卫）。

测试结果：单元 19/19 通过；E2E 10/10 通过；`npm run build` 通过。
