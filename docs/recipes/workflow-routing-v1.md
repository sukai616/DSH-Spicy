# 生图工作流路由（按意图匹配）

收到生图请求时，先用 [`skills/qwen-image/SKILL.md`](../../skills/qwen-image/SKILL.md) 的意图表定位路线，再回本文查命令骨架与参数。**不要从头试起，也不要混用两条路线的参数。**

本文是操作正本；实验过程与历史数据在个人知识库的 SOP 里，不在仓库内。

## 全局前提（所有路线共用）

| 项 | 值 | 说明 |
|---|---|---|
| steps | **8** | 蒸馏模型的固定调度，调高是负收益 |
| guidance | **1** | Turbo 强制，改不了 |
| negative_prompt | **不传** | 本机对负面词几乎无响应，改写为正面断言 |
| `--small-text-encoder` | **全局必带** | 身份均值 0.661 vs 默认 0.624，显存 13.3GB vs 18.2GB，3 个 seed 全胜 |
| 试稿分辨率 | 512×768 | 约 5 分钟/张 |
| 生产分辨率 | 1536×2048 | 身份约 0.61，稳定高于 0.5，可直接定稿；显存峰值 33.7GB，24GB 机器注意 OOM |
| 尺寸上限 | schema 256–4096、16 倍数 | 超出被拒绝；但画质收益在 **2560×2560** 封顶，再大只涨耗时与显存 |

`--small-text-encoder` **不支持** `auto_mask` / `enhance_prompt` / `verify`（源码强制互斥），但参考图与 LoRA 完全可用。

## 路线一：姿势 + 身份 + 全身（最常用）

**适用**：给了人脸参考，要指定姿势（含深蹲、举臂、盘腿、背影等极端姿势），要全身入画。

**为什么不用 ControlNet**：`vnccs-pose` 在 `edit` 里对极端姿势控制力足够。CN 变体没有 `--image-paths`，脸只能靠文字重画，身份实测 -0.029。

```bash
mflux-generate-qwen-2.1-edit \
  --model ~/.dsh/qwen-studio/models/qwen-image-2.1 --quantize 8 --small-text-encoder \
  --image-paths <裁到只剩脸的正脸图> \
  --prompt "<mva> full body view, facing the camera. This exact young woman from <image1>. <姿势>. <服装>. plain warm grey studio wall, full body in frame head to toe." \
  --lora-paths mva-angles.safetensors vnccs-pose.safetensors consistency-lora.safetensors \
  --lora-scales 0.6 0.5 0.5 \
  --steps 8 --seed <N> --width 512 --height 768 --output-resolution 512 \
  --output out.png
```

**参数起点**（已收敛，不必再搜 LoRA）：

| 参数 | 值 | 依据 |
|---|---|---|
| mva-angles | 0.6 | 保证全身入画 |
| vnccs-pose | 0.5 | 0.5→0.720 / 0.3→0.390 / 0.7→0.461 |
| consistency-lora | 0.5 | 极端姿势身份崩的解法，最差从 0.038 提到 0.464 |
| `--strength` | 保持默认 1.0 | 0.5 会锁死源图构图、姿势失效；要用不低于 0.7 |

**姿势写法**：关节角度、支撑面、手的位置、相机朝向。常见姿势（蹲/坐/举臂/背影）笼统描述已足够；只在姿势罕见或模型理解错时才补全四要素。

**稳定性**：温和姿势跨 seed 稳定（0.61–0.72）；极端姿势**必须带 consistency LoRA**，否则某个 seed 会崩到 0.038。

## 路线二：只要脸像

```bash
mflux-generate-qwen-2.1-edit \
  --model ... --quantize 8 --small-text-encoder \
  --image-paths <裁到只剩脸> \
  --prompt "<姿势>. <服装>. <环境>" \
  --steps 8 --seed <N> --width 512 --height 768 --output-resolution 512
```

**无 LoRA**，身份 0.531，是所有方案里最高的。参考脸必须裁到只剩脸——用整张竖屏截图实测 -0.025，还会带出参考里的配饰。

## 路线三：1:1 复刻现成照片的姿态

**身份必然丢**，这是通道限制。只在"姿势必须完全贴合"且能接受换脸时用。

```bash
# 1. 提骨骼（mflux 自带 OpenPose，qwen 变体未接 CLI，需 Python 直调）
~/qwen-studio-venv/bin/python pose-cn-20261126/make_pose.py <真人姿态图> pose.png

# 2. 喂 CN
mflux-generate-qwen-2.1-controlnet \
  --model ... --quantize 8 \
  --controlnet-image-path pose.png --controlnet-strength 0.5 \
  --prompt "<完整描述>" \
  --steps 8 --seed <N> --width 512 --height 768 --output-resolution 512
```

**要点**：
- 控制图必须是**黑底彩色 OpenPose COCO-18 骨架**。手绘线稿、3D 人偶的检出率是 **0%**——它是人体关键点检测器，不认线条画。
- 灰度线稿即使喂得进去，也会被 VAE 当画风复现，输出崩成插画。
- strength 从 **0.45–0.5** 起测。
- 检出率 2.0–3.6% 属正常，低于 0.1% 说明输入不是真人照片。
- 只出身体关键点，**没有手部与面部**，手势复杂时用文字补。
- 没有真人姿态图时：先用路线一按文字生成一张，再提骨架。

## 路线四：纯文生图

```bash
mflux-generate-qwen-2.1 --model ~/.dsh/qwen-studio/models/qwen-image-2.1 --quantize 8 \
  --prompt "<五层骨架>" --steps 8 --seed <N> --width 1536 --height 2048 --output-resolution 1536
```

**五层骨架**：媒介体裁 → 结构约束 → 主体 → 环境与光 → 技术参数。编码器是 Qwen3-VL，写完整自然语言句子，不要堆 `8k/masterpiece` 标签。

**负面词改正面断言**：`anatomically correct hands, five fingers each`、`single <主体>, no duplicate`、`<物体> held naturally with no clipping`、`<材质> with real <物理属性>`。

## 路线五：风格化

纯文生图 + 风格 LoRA。实测 Clay-Sculpture-Style 的 sharp 从 227 降到 139（降幅 39%），确实生效；触发词影响小（37.74 vs 38.64）。

**铁律**：风格 LoRA **不叠加到身份路线**。附加任何非核心 LoRA 身份都降分：omni@0.3 → 0.582、natural-exposure@0.3 → 0.689、photo-aesthetics@0.3 → 0.695（基准 0.719）。要其他效果就另起任务。

## 路线六：换装

`edit` + 文字描述服装，身份 0.372，比 `outfit-swap` LoRA 更稳（该 LoRA 实测反而更差）。不喂服装图，文字写清裤型、贴合度、垂坠感。

## 路线七：换机位

`edit` + AnyAngle @0.8–1.0，prompt 写机位。身份 0.526，但机位跟随弱，需要文字配合。

## 路线八：多参考图

三图（脸 + 身材 + 服装）是当前最佳，身份 0.509，接近单图基准。

**四条硬条件**：
1. 每张图职责单一，prompt 用 `<image1> <image2> <image3>` 明确指代。
2. **脸图放第一张**（`images[0]` 是 edit source 决定 blend 起点，`images[-1]` 决定宽高比）。图序反转会带出斜挎包。
3. 脸图裁到只剩脸。
4. **必须全图脱敏**。串味来源常不是最显眼那张——实测背带来自身材图而非服装图。

**串味处理**：裁切优先，把配饰连同背景一起裁掉。**提高 output_resolution 完全无效**（仍有包，多涨 7GB 显存）。**不要手绘色块覆盖**，会让形状更明显。服装图可取一块干净布料纹理平铺。

**拼图法不可用**：三图拼一张会被当成"一张有三个人"，脸部出现拼贴痕迹（0.428）。

## 路线九：局部重绘

只在 controlnet 变体内可行（`--image-path --mask-image --controlnet-image-path`），但**无身份参考**，破坏身份（22 岁 → 40 岁）。只修背景/衣物/道具，**绝不重绘人脸**。

## 评测

评测脚本：`qwen-eval-tools/eval_std.py`（五个子命令，标准实现，零自造系数）。

| 维度 | 方法 | 命令 | 备注 |
|---|---|---|---|
| 身份 | ArcFace/InsightFace buffalo_l 余弦 | `identity <结果> <参考脸>` | >0.40 同一人 / 0.28–0.40 可疑 / <0.28 不同人 |
| 姿态 | COCO OKS | `pose <结果> <真值图>` | 自比 1.0 / 同姿势 >0.90 / 不同 <0.70 |
| 质量 | BRISQUE | `quality <结果>` | 越低越好，常见 20–50 |
| 有参考质量 | SSIM / LPIPS | `quality_ref <结果> <参考>` | SSIM 越高、LPIPS 越低越像 |
| 比例 | MediaPipe 33 点 + InsightFace 106 点 | `body <结果>` | 仅 A/B 比较，不能换算厘米 |

**必须目视**：极端姿势、多参考图、主观审美、姿势准确度。量化与目视冲突时**先怀疑算法**——自造指标曾给出与目视相反的结论，已全部废除。

## 失败模式

| 症状 | 根因 | 对策 |
|---|---|---|
| 脸完全不像 | 参考图里没脸/脸太小 | 裁到只剩脸，先跑人脸检测 |
| 姿势丢（变站姿） | 只给骨架没写文字 | 补姿势描述 |
| 画风变线稿/3D 白模 | 用灰度线稿当控制图 | 换 OpenPose 彩色骨架 |
| 带进杂物 | 参考图里有该物件 | 逐张裁干净，提分辨率无效 |
| 头变大/胯变低 | 数字约束被过度执行 | 删数字，改空间参照 |
| 腰过细呈漏斗 | 用了 `narrow`/`slim` | 改写成缓坡描述 |
| 换 seed 后身份崩 | 极端姿势通道竞争 | 加 consistency LoRA @0.5 |
| 加新 LoRA 后身份变差 | 稀释身份通道 | 移除，另起任务 |
| 皮肤发霉/脏污感 | 步数被调高或 LoRA 过强 | 回 8 步，降强度 |
| 输出锁死源图构图 | edit `--strength` 降到 0.5 | 保持 1.0，不低于 0.7 |

## 已证伪的路径

| 想法 | 结论 |
|---|---|
| CN 出图后用 edit 换脸 | 第二段会把脸重新生成 |
| 用基础模型 CFG 提参考权重 | 本机无权重，Turbo 强制 guidance=1 |
| 训练角色 LoRA | 模型无 `training_adapter` |
| 极端姿势必须靠 CN | 已推翻，双 LoRA + 文字即可 |
| 多图必然稀释身份 | 有限条件成立：三图 + 双 LoRA 可用 |
| 提分辨率消除串味 | 完全无效，只涨显存 |
| 拼图法做多参考 | 脸部出现拼贴异物 |
| 完整四层身形锚点 | 反而恶化胯位，只用胯位空间参照 |

## 资源库 LoRA 出处与配方（2026-11-27 全网核实）

本地文件无元数据的三个，已按官方模型卡确认来源与必需配方：

| 本地文件 | 官方来源 | 关键信息 |
|---|---|---|
| `turbo8_lora_step2500.safetensors` | [chriswritescode/Turbo8](https://huggingface.co/chriswritescode/Turbo8-LoRA-Qwen-Image-2.1) | 8 步**步数蒸馏** LoRA（DMD2 + 轨迹回归），把 base 的 40 步压到 8 步、CFG=1。rank 128。**固定配方：steps 8 / cfg 1 / euler / simple + shift_terminal=None**，任一项改动都没有收益 |
| `casual-phone-photo.safetensors` | [19nbrown/casual-phone-photo-style-lora](https://huggingface.co/19nbrown/qwen-image-2.1-casual-phone-photo-style-lora) | 风格适配器，126 图 rank 32。**必需触发词 `lbxstyle`**，官方建议强度 **0.8** |
| `photo-aesthetics-v2.safetensors` | [SimpleTuner/photo-aesthetics-v2](https://huggingface.co/SimpleTuner/Qwen-Image-2.1-LoRA-photo-aesthetics-v2) | 5 万步照片美学 LoRA，512/1024 多尺度 + REPA。rank 32/alpha 32。无触发词，官方按强度 1.0 使用 |

**两条需要修正的用法**：

1. **`casual-phone-photo` 缺触发词**。官方要求 prompt 里含 `lbxstyle` 才激活风格，我们此前只按强度调、没写触发词。官方建议 0.8，本机预设用的是 0.5。
2. **`turbo8` 的调度器**。官方要求 euler + simple + `shift_terminal=None`；本机若走 `linear` 调度器，与蒸馏配方不一致，画质会劣化。用 turbo8 时优先确认调度器，或改用 base 默认路径。

> **实测结论（2026-11-27）**：
> - 本机 mflux 的调度器只有 `linear`、`flow_match_euler_discrete`、`seedvr2_euler` 三个，**没有官方要求的 `simple`**。
> - mflux 源码里**没有 turbo8 的任何配方**（grep 零命中）。它的 `qwen21_scheduler.py` 是给 **Viggle turbo LoRA** 写的固定 sigma 表（6 步、`SIGMA_NODES=(1.0,0.9375,0.875,0.75,0.5,0.25)`），不是 turbo8 的 8 步蒸馏表。
> - 因此**本机叠加 turbo8 时无法完全复现官方配方**：步数 8 与 cfg 1 能对上，但 `euler/simple + shift_terminal=None + ModelSamplingFlux(max_shift 0.6935)` 这一整套无法原样提供。
> - 现状**待确认**：本机实际画质是否已受影响。已知本机主方案（三 LoRA + edit）不依赖 turbo8，用它只为 base 打底的场景；若要用 turbo8 追求速度，应先做一次 A/B 对比确认是否劣化。

## 资源库 LoRA 现状

**核心三件（唯一推荐组合）**：`mva-angles` @0.6、`vnccs-pose` @0.5、`consistency-lora` @0.5

**历史测试，不推荐用于主方案**：anyangle、anything2real、casual-phone-photo、outfit-swap、photo-aesthetics-v2、turbo8

**风格类（仅纯文生图）**：Clay-Sculpture-Style、Next-Scene

全网搜过的 ma-angles-v2、natural-exposure 均低于现组合，**不必再找**。
