# PetLink 真实项圈 MVP

## 范围与使用

需求来自本次用户要求，测试日志和开发包用于核对硬件，不作为额外操作授权。

| 能力 | 本版实现 | 验收含义 |
| --- | --- | --- |
| BMI270 六轴数据 | 真实采集，50Hz | 当前板子数据，可见固件版本、时间、序号及六个轴 |
| 云端存储 | 设备独立令牌，SQLite WAL，提交后 ACK | 重试幂等，网页使用独立 Web 令牌，重启数据保留 |
| 动作识别 | 可解释规则运动代理 | 静止/步行样/跑动样/抖动；未训练实宠模型，无宠物行为准确率承诺 |
| 3D 宠物联动 | Three.js 加载真实生成/导入 GLB | 跟随新鲜遥测；断线停止；优先已有动画，无骨骼时明确标注整体姿态反馈 |
| 室内照片/视频 | Depth Anything V2 Small 实际推理 | 带纹理可见表面相对深度 3D；2D 户型仍由用户确认尺寸辅助生成，不是自动准确全屋 |
| 宠物照片/视频建模 | TripoSR + U2Net + xatlas 实际推理 | 带贴图 GLB，任务支持取消、重试和下载；单图遮挡面为模型估计，无专属骨骼 |
| 定位、电量、投喂、摄像头、声音、情绪 | 原有界面演示 | 六轴 IMU 不能提供这些数据，真实页不伪造数值 |

打开部署入口，在「真实项圈」输入部署时提供的 Web 令牌，观察在线状态、最近窗口和轴值。轻晃板子可观察运动强度与 3D 动作；不要把手持测试当作实宠准确率测试。令牌只存在当前浏览器会话。点击「断开」移除会话令牌并冻结动作。

四类入口分别接收宠物照片、宠物视频、室内多张照片和室内视频。素材通过 Web 令牌上传到云端私有目录，查看也需鉴权；Mac 主动通过 HTTPS 领取推理任务。原始素材和模型不进入 GitHub。GLB 上限25MB、必须自包含；匹配 Idle/Rest、Walk、Run、Shake 动画名，无骨骼模型只显示整体姿态变化。手工矩形房间和已有 GLB 导入继续保留在浏览器。模型位置是展示位置，六轴不是室内定位。

视频从前12秒每秒抽帧并选择清晰的一帧，因此本版未融合视频多视角。室内多图均保存，当前默认深度引擎使用首图，其余为参考；结果明确显示此限制。单张可见表面具有相对深度，不能冒充完整、可测量户型。

## Web 设备配网

0.2.1 新增网页配网入口，适用于已经配置云端身份的本板。通过 USB 数据线连接电脑，在支持 Web Serial 的桌面浏览器（推荐 Chrome/Edge）打开 HTTPS 页面，点击「设备配网」并由用户在浏览器设备选择框选择 M5Capsule。页面先读取固件能力，再填写 2.4GHz Wi-Fi 名称与密码；设备只修改自己的 Wi-Fi 配置，保留云端地址、设备 ID 和上传令牌。

密码只用于当前页面到已选择 USB 设备的通信，不写入浏览器存储或上传云端。固件保存到独立 NVS 命名空间后重启；「配置已保存」不等于「联网成功」，页面根据设备 STATUS 显示实际连接情况。USB 重启重新枚举后如果浏览器需要选择设备，请再次选择原板；错误网络可以通过同一入口重配。

Codex 内置浏览器或其他浏览器若没有 Web Serial 支持，页面提供复制链接和使用桌面浏览器的提示。首次 USB 访问由浏览器要求用户选择授权，不能通过网页静默授予。这个入口负责 Wi-Fi 更新，不是恢复出厂或固件刷写；新设备的首次云端身份配置仍使用固件仓库的私有配置脚本。

配网流程复用 [Chrome 官方 Web Serial API](https://developer.chrome.com/docs/capabilities/serial)，按用户操作打开端口，并在断开时释放读写锁。浏览器能力由 feature detection 判断。

## 项目布局

- `src/components/collar/`、`src/pages/CollarPage.tsx`：真实 3D 与交互。
- `src/store/useCollar.ts`：鉴权轮询、超时和离线状态。
- `backend/`：FastAPI、SQLite、运动规则。
- `deploy/`：独立 systemd 服务、代理增量片段、SQLite 备份工具。
- 相邻 `petlink-firmware/`：独立固件仓库，原始 Flash、日志和凭据只在其 `.private/`。

## 开发和构建

```sh
npm ci --ignore-scripts
npm test
VITE_BASE_PATH=/petlink/ VITE_DISABLE_SUPABASE=true npm run build
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt
.venv/bin/python -m pytest backend/tests -q
```

后端要求 Python 3.9+，服务器采用 Python 3.12。`PETLINK_VIEWER_TOKEN`、`PETLINK_DEVICE_TOKEN` 和 `PETLINK_WORKER_TOKEN` 必须分别生成至少24字符的随机令牌；不能复用。运行环境示例（值替换为私有随机值，不提交 Git）：

```dotenv
PETLINK_DEVICE_ID=capsule-01
PETLINK_VIEWER_TOKEN=<viewer-random-token>
PETLINK_DEVICE_TOKEN=<device-random-token>
PETLINK_WORKER_TOKEN=<worker-random-token>
PETLINK_MEDIA=/srv/petlink/shared/media
PETLINK_BASE_PATH=/petlink/
PETLINK_DB=/srv/petlink/shared/petlink.sqlite3
PETLINK_STATIC=/srv/petlink/current/dist
PETLINK_COMMIT=<full-source-commit>
```

启动命令：`uvicorn backend.app:create_app --factory --host 127.0.0.1 --port 8091 --workers 1`。直接打开该端口时，前端需构建为 `/`；生产代理剥离 `/petlink/` 前缀。生产禁用上游内置 Supabase 连接，避免将新部署数据写到原型的共享实例。

## 设备协议与状态

公网路由为 `/petlink/api/*`，后端内部路由为 `/api/*`。

| 接口 | 凭据 | 返回/动作 |
| --- | --- | --- |
| `GET /api/health` | 无 | 版本、完整提交、算法及 schema；不含遥测或令牌 |
| `POST /api/telemetry` | 设备 Bearer | 验证、分类、SQLite 提交后 ACK |
| `GET /api/live` | Web Bearer | 设备、最新窗口、最近30个窗口、在线状态 |
| `GET /api/events?limit=50` | Web Bearer | `{events: [...]}`，最大200条 |
| `GET /api/capabilities` | Web Bearer | 当前能力和推理节点状态 |

上传示意（数值仅说明格式，不是实机证据）：

```json
{"deviceId":"capsule-01","bootId":"random-per-boot","seq":0,"firmware":"0.2.0","transport":"wifi","sampleRate":50,"capturedAt":1791600000000,"samples":[{"t":20,"ax":0,"ay":0,"az":1,"gx":0,"gy":0,"gz":0}]}
```

加速度单位 g，角速度 °/s；t 为设备单调毫秒，capturedAt/receivedAt 为 UTC Unix 毫秒，界面按本地时区显示。样本上限200、窗口跨度最多10秒，正常每1秒50个样本。单样本示意会分类为 unknown。请求上限128KiB。默认 transport 为 usb-serial，直连填写 wifi。

幂等键是 `(deviceId, bootId, seq)`，同键同 payload 返回原 ACK；同键不同 payload 返回409。每次启动 bootId 唯一、同 boot 按序单队列上传。数据库保留最近约20,000个原始窗口（每300次插入清理），约5.6小时@1Hz；精确历史 ACK 也仅在该范围内。每个 boot 的序号高水位长期保留，已淘汰或乱序的旧序号返回409，不能作为新事件重新插入。USB 网关隔离永久错误而不静默删除原始数据。

“接收”不等于落盘：只有 `accepted:true` 才表示事务已提交且已完成规则处理。网页通常1秒轮询；10秒未接收或捕获数据超过15秒即离线，补传旧数据不恢复在线。模型成功播放是 Web 状态，不由设备 ACK 冒充。

规则使用加速度模长偏离1g的 RMS 和角速度模长 RMS，避免方向依赖。低采样率运动窗口、样本不足返回 unknown。置信度为工程规则分数，不是统计校准概率。

## 部署隔离

独立账号 petlink，独立 `/srv/petlink/` 目录，后端仅监听 `127.0.0.1:8091`；SQLite和私有env在shared，源码发布在releases，current指向运行版本。systemd限制256MB和半核CPU，不改既有业务容器、数据库或服务配置。

HTTPS由现有Caddy提供，在已存在站点中添加 `/petlink/*` 路由和 `/petlink` 重定向；仅此路径将请求体上限设为152MB用于视频，其它路径原21MB上限不变。先备份、验证候选配置，再 graceful reload；不重启现有容器。现有站点根路径仍指向原后端。PWA的start_url、scope、图标和资源全部限制在 `/petlink/`。

发布步骤：冻结代码并记录完整提交 → 生产构建 → 私有 SQLite 在线备份 → 复制 backend/dist/deploy 至新版本目录 → 安装锁定依赖 → 切换current → 只重启petlink → 核对公网health提交、页面和遥测 → 比对既有业务首页哈希/容器启动时间。

## 停止、恢复和回滚

- Web断开：页面「断开」；不会关闭板子采集或删除云端数据。
- 服务重启：`systemctl restart petlink`。服务停止只影响 `/petlink/`。
- 固件停止上传、换网与回滚：见独立固件仓库 README / docs/ROLLBACK.md。不要擦除整个Flash或NVS。
- 数据备份：在服务环境中运行 `python deploy/backup.py <new-backup-path>`，采用 SQLite backup API，不直接复制活跃 WAL 数据文件。
- 应用回滚：保留shared，current切回前一版本目录，只重启petlink。schema2是增加高水位表，无破坏性迁移；回滚旧程序会失去淘汰窗口防重保护，因此优先回滚至同schema版本。
- 媒体结果迁移：新版本增加 `media_jobs.result_dir`，旧结果目录仍兼容。已有新结果后，回滚版本必须保留支持该字段的 `jobs.py`，否则旧程序无法找到新生成的结果目录。保留数据库备份与媒体目录，不删除原始素材。
- 完全撤掉PetLink代理入口：基于部署时备份只移除新增路由并验证/重载；如果既有站点后来变化，不要整份覆盖旧备份。

Web令牌、设备令牌、推理节点令牌、Wi-Fi密码、服务器凭据、原始Flash、原始日志不提交到仓库。发布包只含无设备配置的应用固件和源码，不含配网后的NVS镜像。

## 照片任务与本地推理节点

`GET /api/jobs` 返回真实任务和节点心跳；`POST /api/jobs` 以 multipart 的 `kind=pet|room` 和 `files[]` 上传。支持1–12张图片或单个视频；单图15MiB、视频100MiB、合计150MiB。最多6个活动任务，媒体总量1GiB。`POST /api/jobs/{id}/cancel|retry` 取消或重试。结果经结构校验并落盘后才进入 succeeded，取消后旧租约不能覆盖新结果。输入、预览和GLB下载均要求 Web 令牌。

服务端是 CPU/4GB 主机，模型在开发 Mac（M5，16GB）使用 MPS；设备上传和网页查看不依赖 Mac，**新照片/视频推理需要 Mac 在线且未休眠**。模型代码和权重来源见 `models/README.md`，不用额外收费 API 或 Codex 内置模型端点。照片不发给第三方推理服务。

本地 worker 使用 `backend/model_worker.py`，配置如下：

```dotenv
PETLINK_API_BASE=https://<host>/petlink/api
PETLINK_WORKER_TOKEN=<same-private-worker-token-as-server>
PETLINK_ENGINE_PYTHON=<engine-directory>/.venv/bin/python
PETLINK_ENGINE_SCRIPT=<engine-directory>/run_job.py
PETLINK_WORKER_DATA=<private-directory>/model-worker
PETLINK_MODEL_CAPABILITIES=pet,room
```

本地 Mac 使用 `~/Library/LaunchAgents/com.petlink.model-worker.plist`；令牌放工作区私有 env，plist 只指向启动脚本。停止：`launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.petlink.model-worker.plist`；启动：`launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.petlink.model-worker.plist`。节点离线时任务保留 queued；运行任务失联超过3分钟，下一次节点领取时转 failed，可在网页重试。服务器支持同一家庭，尚未实现多租户用户系统。

室内完整2D/3D结构仍需要可靠的多视角配准、相机/尺度校准与结构提取。当前真实相对深度、人工尺寸平面图各自标注来源，不能用于测量或导航。宠物专属骨骼绑定及实宠动作分类数据集训练仍是后续项。
