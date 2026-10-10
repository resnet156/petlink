# PetLink 开源复用调研（2026-10-10）

调研先于实现；依据作者 GitHub、官方板卡文档和原始论文。下表保留选型依据，实际落地与验证见文末。未上传用户照片、日志或凭据到第三方模型服务。

## 本版推荐

先复用 **M5Unified 的板卡/IMU 驱动 + 现有 PetLink Web + 鉴权遥测后端 + Three.js 动画**，打通真实传感器数据到网页可见状态。云端先用可解释的运动强度规则，明确标为“试验性动作估计”；同时保存六轴窗口，为后续实宠标注训练留数据。静止、低强度活动、高强度活动可以演示；“睡眠、吃饭、喝水、抓挠”等犬猫行为不得仅凭手摇板子的阈值宣称准确识别。

家庭照片建房与个性化宠物 3D 生成应使用独立异步任务接口。未验证 GPU / 模型权重 / 真实照片前，不把生成占位效果冒充重建结果。CPU 服务器可先承担上传、持久化、状态、预览以及人工校正的布局。真实模型推理由独立 worker 承担，避免影响同机已有业务。

## 开源实现与取舍

| 能力 | 可复用项目及一手来源 | 许可证 / 运行条件 | 对本版的实际价值与边界 |
| --- | --- | --- | --- |
| M5Capsule 六轴采集 | [M5Unified](https://github.com/m5stack/M5Unified)、[Capsule v1.1 官方硬件资料](https://docs.m5stack.com/en/core/Capsule_v1.1) | M5Unified 为 MIT，依赖 M5GFX；官方文档确认 v1.1 为 Stamp-S3A + BMI270 | 首选官方初始化、IMU 与电源接口。引脚、分区、现有固件仍以实际板子和随附源码为准，不能只凭名称刷写。 |
| MCU 端轻量模型 | [espressif/esp-tflite-micro](https://github.com/espressif/esp-tflite-micro) | 组件/例程 Apache-2.0；依赖分别授权；ESP-IDF，支持 ESP32-S3，算子可由 ESP-NN 加速 | 是推理运行时，不含开箱即用的可靠宠物分类器。完成数据采集和验证后再部署量化模型。 |
| 动物行为训练与评估 | [earthspecies/BEBE](https://github.com/earthspecies/BEBE)、[原始论文](https://pmc.ncbi.nlm.nih.gov/articles/PMC11654173/) | 代码 GPL-3.0；各数据集来源与许可另查；Python/PyTorch；CNN、CRNN、随机森林等模型 | 有犬类在内的动物传感器数据及按个体评估方法。适合隔离的研究/训练工具，不直接无审查复制进产品固件。评估必须按宠物个体分组，防止相邻窗口泄漏。 |
| 犬类姿态参考 | [mmarcato/dog_posture](https://github.com/mmarcato/dog_posture)、[原论文与数据链接](https://pmc.ncbi.nlm.nih.gov/articles/PMC10284380/) | GitHub 页面未发现明确代码许可证，暂不拷贝代码；研究使用颈部/背部/胸部 IMU | 能学习特征和实验设计。研究结果不能直接迁移到单个 BMI270 项圈；佩戴位置、犬种、松紧与采样率都会影响结果。 |
| 浏览器 3D 动画 | [Three.js](https://github.com/mrdoob/three.js)、[Khronos Fox 样例](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/Fox/README.md) | Three.js 为 MIT。Fox 模型由 PixelMannen 提供、CC0；tomkranis 的骨骼动画和 AsoboStudio/scurest 的 glTF 转换为 CC-BY-4.0 | 已有 Survey / Walk / Run 动画，可用 AnimationMixer 平滑切换。这是具名示例动物，不是用户宠物重建；需携带署名。优先保留同事已有模型。 |
| 360 室内照 → 房间轮廓 | [sunset1995/HorizonNet](https://github.com/sunset1995/HorizonNet) | 代码 MIT；README 明确权重下载须接受训练数据集条款。Python/PyTorch；老依赖需要隔离 | 输入是 **360 全景图**，输出墙/顶/地边界与布局 JSON，带 3D 查看器。可据墙角输出 2D 平面和挤出 3D 房间。普通局部照片不能假装满足其输入；真实尺寸须补充标尺/房高。 |
| 多张室内照 → 三维几何 | [facebookresearch/vggt](https://github.com/facebookresearch/vggt) | 自定义许可；商业使用需获准的 **VGGT-1B-Commercial** 权重，原始 VGGT-1B 权重仍非商业。PyTorch，GPU 更实用 | 推断相机、深度、点图，并可导出 COLMAP；不是完整户型图提取器，仍需平面拟合、墙体建模、人工修正。新 README 已有显存优化，不能沿用旧版显存表。 |
| 多视图照片传统重建 | [COLMAP](https://github.com/colmap/colmap)、[官方 FAQ](https://colmap.github.io/faq.html) | new BSD；依赖分别授权。无 CUDA 可做 CPU 稀疏重建；官方稠密阶段有 GPU 条件 | 适合静态、重叠且有纹理的室内照片。白墙、镜子、反光、运动宠物会造成困难。产物首先是点云/相机，不等于结构化平面图。 |
| 单张宠物照 → 三维外形 | [VAST-AI-Research/TripoSR](https://github.com/VAST-AI-Research/TripoSR) | MIT 明确覆盖代码、模型与 demo；Python ≥ 3.8、PyTorch；默认单图约 6GB VRAM | 第一优先的开放许可验证路线，可输出 mesh 并烘焙纹理。适合快速证明“照片进入真实模型推理，得到 3D 工件”。单图背面依赖模型先验，不能保证真实还原；自动骨骼和动作不在其交付能力内。 |
| 更精细宠物外观 | [microsoft/TRELLIS.2](https://github.com/microsoft/TRELLIS.2) | 模型和代码 MIT，nvdiffrast/nvdiffrec 分别授权；官方要求 Linux、NVIDIA ≥ 24GB VRAM，CUDA 推荐 12.4 | 4B 图生 3D，支持 PBR 材质，适合第二阶段质量提升。高质量生成不等于已绑定可动画四足骨架；需后续 rigging/重拓扑。 |
| 形状与纹理生成备选 | [Tencent-Hunyuan/Hunyuan3D-2](https://github.com/Tencent-Hunyuan/Hunyuan3D-2)、[许可证](https://github.com/Tencent-Hunyuan/Hunyuan3D-2/blob/main/LICENSE) | 自定义 Tencent Hunyuan 3D 2.0 许可，排除欧盟/英国/韩国，另有超过 100 万月活条件。当前 README 为形状 6GB、形状+纹理共 16GB VRAM | 提供单图、多视图、API server 和 GLB/OBJ 输出，质量路线强；不能当成无条件 MIT 项目。对国际化产品需单独核对适用范围。 |

## 可以马上落地的协议

建议遥测包含 `device_id`、`boot_id`、单调 `seq`、`sample_rate_hz`、设备时间/服务接收时间、六轴样本（明确 accel 单位 g、gyro 单位 °/s）、固件版本、电池电量。服务端按设备/启动/序号去重，保留原始窗口和算法版本，网页同时显示“最后更新时间”“连接状态”“估计方法”。没有新数据时显示离线，不继续伪造运动。

先采样 25–50Hz、1–2 秒窗口作为起点（工程建议，不是已验证的最佳参数）。计算去重力加速度强度、变化量和角速度，加入持续时间/滞回防止闪烁。状态映射到预制动画只是可视化；在足够真实标注前，页面使用“静止/活动/剧烈活动”比断言“睡觉/走路/跑步”更可靠。

上传和建模任务建议有 `queued/running/succeeded/failed/cancelled` 状态、输入 hash、模型/权重版本、工件路径、错误与重试入口。没有配置推理 worker 时应明确 `unavailable` 或待处理，禁止计时器走完后返回与上传内容无关的“成功”。

## 真实建模验收与逐步演进

1. **本版传感器纵向闭环**：真实板卡产生六轴数据 → 设备鉴权 → 服务落盘 → 算法估计 → 同事 Web 动画响应。拔线/断网后正确离线，恢复后可继续上报；旧业务前后健康检查一致。
2. **照片/视频准备**：房间每个房间拍一张规范 360 全景，或连续拍摄有重叠的静态视角；提供一项真实尺度。宠物先选单只、主体完整、清晰无严重遮挡的照片；视频抽帧挑相同姿态的高质量视图，运动中的不同姿态不能直接当静态多视图融合。
3. **照片建房**：实跑 HorizonNet / 合适的多视图模型，保存输入 hash、推理日志、布局 JSON、2D SVG 与 3D GLB；与人工标注房角/尺寸对照。若使用人工尺寸/墙角，显式标注“手工布局”，不要称 AI 照片重建。
4. **个性化宠物**：实跑 TripoSR 验证输入相关的输出，再比较 TRELLIS.2 / Hunyuan3D 的外观；之后单独处理四足骨骼、权重绑定与动画重定向。模板换色/照片贴图属于外观定制，不等于个体三维重建。
5. **动作语义**：采集多只犬猫、不同佩戴方向与松紧的同步视频和 IMU，按个体划分训练/验证/测试，报告混淆矩阵、macro-F1、延迟、误报率和能耗。再决定是否将轻量模型放到 ESP32-S3。

首次运行固定依赖版本和上游提交，保存 THIRD_PARTY_NOTICES。

## 本次实际落地

已复用同事 PetLink、M5 官方 BMI270 初始化数据、ESP-IDF HTTP/TLS、Three.js 官方 RoomEnvironment/OrbitControls/接触阴影、TripoSR、U2Net、xatlas 和 Depth Anything V2 Small。模型代码/权重固定修订与校验值见 [models](../models/README.md)，WebGL 来源与完整 MIT notice 见 [THIRD_PARTY_WEB.md](THIRD_PARTY_WEB.md)。

用户柴犬照片经 TripoSR 生成 37,905 顶点、49,864 面和 1024² 内嵌贴图，M5/MPS 首次总耗时24.57秒；室内首图经 Depth Anything V2 Small 生成43,776顶点的相对深度可见表面，耗时3.52秒。两个真实工件均经过云任务回传和GLB结构校验。模型在 Mac 推理，4GB CPU 服务器只处理API/存储/静态文件。

五张室内照片还实际进行了三次 COLMAP 配准：最佳结果注册3/5张、67个稀疏点、平均重投影误差1.0845像素。没有得到可靠完整户型，因此没有把稀疏点云包装成自动全屋结构。视频抽帧用独立工程 MP4 验证，未声称已测试用户真实视频。详细证据与限制见 [models/VALIDATION.md](../models/VALIDATION.md)。
