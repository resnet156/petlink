# Q 版骨骼桌宠：主仓库融合与模型验收

更新于 2026-10-20。此文记录已经核实的能力和未通过的质量门槛；界面不得把静态网格称作自动骨骼桌宠。

## 与团队主仓库的关系

开发分支以 [barneyyyy99/petlink](https://github.com/barneyyyy99/petlink) 的 `97e3a7d`（v0.1.17）为新基线。保留原四项导航、默认首页、照片/GIF 头像、`?mini=1` 透明桌面组件及其「地图+宠物 / 仅宠物」切换、自动户型识别和 Supabase 数据；宠物生成作为原首页及原桌宠的增量能力。持久化 schema 仍为 7，避免清空已有宠物与房间。旧的独立真实项圈页保留为硬件、配网和实验功能入口。

## 开源方案与取舍

| 环节 | 一手实现 | 当前结论 |
| --- | --- | --- |
| 照片/视频解码 | 项目现有 FFmpeg、U-2-Net；[TripoSR](https://github.com/VAST-AI-Research/TripoSR) | 上传和视频抽帧已能工作，但用户给的柴犬照片（以及补全四肢的 Q 版概念图）经 TripoSR 重建后出现巨大白色方块和缺失肢体，**不能**作为可发布桌宠网格。 |
| 更好的照片生 3D | [AssetFurnace](https://github.com/Bingeljell/image-to-3dlab) 整合 Hunyuan3D-MLX、Pixal3D 和 TRELLIS；[MLX-Serve](https://github.com/ddalcu/mlx-serve) 提供 Hunyuan3D 2.1 图生 3D API | 均需在这台 16GB Apple M5 上实跑原图并多角度检查。项目 README 的示例和速度不是这台机器的验收数据。Hunyuan 权重有 [腾讯社区许可证](https://github.com/Tencent-Hunyuan/Hunyuan3D-2/blob/main/LICENSE)，不能当作 MIT 权重分发。 |
| 自动骨架与蒙皮 | [SkinTokens](https://github.com/VAST-AI-Research/SkinTokens)、[UniRig](https://github.com/VAST-AI-Research/UniRig)；AssetFurnace 的 Apple MPS 移植 | 自动绑定候选。原始 SkinTokens/UniRig 的官方运行环境偏 CUDA，需验证移植和四足动物结果。骨架存在不等于蒙皮变形正常。 |
| 四足动作 | [AssetFurnace 四足管线](https://github.com/Bingeljell/image-to-3dlab/blob/main/docs/quadruped-pipeline.md)、[blender-kiln](https://github.com/elithril/blender-kiln) 四足步态脚本 | 前者官方文档要求人工拟合 metarig 和目检权重，不能宣称完全自动；后者是代理辅助资产制作流程，不是可直接部署的图生 3D 服务。需在自动绑定后的真实狗模型上实测 Idle/Walk、足底和体型变形。 |
| 桌面渲染 | 主仓库 `MiniWidget` + [Three.js GLTFLoader/AnimationMixer](https://github.com/mrdoob/three.js) | 仅当前宠物 `pet.id` 的已校验骨骼 GLB 可进入「仅宠物」视图；模型缺失或 WebGL 失败时回退原照片/GIF/PetSvg。 |

## 新任务契约和质量门槛

旧 `kind=pet` 保持静态 TripoSR 重建兼容。新 `kind=pet_avatar` 接受当前宠物的 `petId` 与一张图片或一段视频。推理节点没有报告 `pet_avatar` 能力时，页面明确显示服务未就绪，服务端也不接受该任务；不会用旧静态结果伪装完成。

生成结果必须由服务端解析 GLB，确认 skinned mesh、至少四个关节，以及作用到关节上的 `Idle` 和 `Walk` 动画，才返回 `rigged: true`、`animated: true` 与动画列表。前端再次检查结构后，按账户/家庭或 Web 访问令牌及 `pet.id` 缓存在 IndexedDB；历史任务可重试/取消，切换宠物或账号不会串用模型。结构校验只是最低门槛，发布前还需要实际多视角外观、站立/行走变形、透明桌宠和原四页面回归。

浏览器同源的 `?mini=1` 浮窗可读取该缓存；现有安装版 Electron 从 `file://` 加载，无法共享网站的 IndexedDB 或 Web 令牌，暂时回退为原照片/GIF/PetSvg。安装版自动同步模型需要独立的鉴权同步实现与重新发版，不把网页预览效果宣传成安装版已具备。

Mac 是唯一的推理节点；云服务器只排队、存储和提供 Web/API。服务器原有 `/srv/dudu`、本地 8080 Docker 业务不参与模型推理或改动。用户照片与权重保存在忽略目录，不进入 Git。
