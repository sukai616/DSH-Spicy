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

**生成必须串行，一次只跑一个。** 本机 24GB 统一内存装不下两个 edit（单张峰值约 13GB），并发会互相抢内存卡在早期步数——实测 4 个进程同时跑，两个卡在 2/8 步十几分钟不出图，看着像任务失败。要对比多个方案就排好队逐个跑，不要为省时间并发。

## 路线一：姿势 + 身份 + 全身（最常用）

**适用**：给了人脸参考，要指定姿势（含深蹲、举臂、盘腿、坐地、背影等极端姿势），要全身入画。有姿势图（骨架或真人姿态图）时用本节；只有文字描述姿势时，见本节末尾的降级写法。

**为什么不用 ControlNet**：`vnccs-pose` 在 `edit` 里对姿势控制力足够，而且 CN 通道从源码上就没有身份输入口。CN 变体没有 `--image-paths`，`_encode_prompt` 走的是 `QwenImage21PromptEncoder.encode(prompt, [], ...)`——**视觉槽位传的是空列表**，脸图喂进去也不参与编码。这不是参数问题，调 strength 或加 LoRA 都改不了，身份实测 -0.012 ~ -0.029。

### 图序铁律：姿势图放第一张（2026-11-27 实测）

`images[0]` 是 edit 的起点图（源码 `reference_image = ImageUtil.load_image(image_paths[0])`），它决定构图与姿势的基底；`images[-1]` 决定输出宽高比。**姿势图必须放第一张，脸图放它后面。**

同一 seed、同一 prompt、只调图序的对照：

| 图序 | 姿势 | 身份（ArcFace） |
|---|---|---|
| 脸图第一 | 姿势被起点图拉回，退化成默认站姿 | 0.665–0.734 |
| **姿势图第一** | **坐地、双手撑地，贴合骨架** | **0.787–0.799** |

图序放反**不报错**，是静默失败：看起来"骨架没生效"，实际是图被当成了要保留的原图。

```bash
mflux-generate-qwen-2.1-edit \
  --model ~/.dsh/qwen-studio/models/qwen-image-2.1 --quantize 8 --small-text-encoder \
  --image-paths <姿势图> <裁到只剩脸的正脸图> [可选: <身材/穿搭图>] \
  --prompt "Replace the pose of the woman in <image2> with the pose shown in <image1>. Keep her exact identity, face, hairstyle and skin tone from <image2>. <image1> only defines body position and limb placement - ignore its colored lines and joint dots entirely, do not copy its style. <姿势文字>. <服装>. Full body in frame head to toe. Plain warm grey studio wall, soft even lighting. One single photorealistic photograph." \
  --lora-paths mva-angles.safetensors vnccs-pose.safetensors consistency-lora.safetensors \
  --lora-scales 0.6 0.5 0.5 \
  --steps 8 --seed <N> --width 512 --height 768 --output-resolution 512 \
  --output out.png
```

**prompt 三件事**：① 明确写"换 <image2> 的姿势为 <image1> 的姿势"；② 明确写"忽略骨架的线条与关节点，不要复制它的画风"；③ 仍要写一句姿势文字兜底（见下）。

**参数起点**（已收敛，不必再搜 LoRA）：

| 参数 | 值 | 依据 |
|---|---|---|
| mva-angles | 0.6 | 保证全身入画 |
| vnccs-pose | 0.5 | 0.5→0.720 / 0.3→0.390 / 0.7→0.461 |
| consistency-lora | 0.5 | 极端姿势身份崩的解法，最差从 0.038 提到 0.464 |
| `--strength` | 保持默认 1.0 | 0.5 会锁死源图构图、姿势失效；要用不低于 0.7 |

**姿势文字仍需保留**：骨架定结构，文字兜底语义。实测去掉姿势文字后，编辑会把"坐姿骨架"理解成"抬腿"或退回站姿；两者同时给才稳。常见姿势（蹲/坐/举臂/背影）一句话够用，只在姿势罕见或模型理解错时才补关节角度、支撑面、手位置、相机朝向四要素。

**降级写法（没有姿势图时）**：去掉 `<姿势图>`，只喂脸图，把姿势完整写进 prompt。此时姿势精度靠文字，身份仍可用（0.665+），但极端姿势容易走形。

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
2. **脸图放第一张**（`images[0]` 是 edit source 决定 blend 起点，`images[-1]` 决定宽高比）。图序反转会带出斜挎包。**例外**：这一条只适用于"没有姿势图、靠文字定姿势"的场景；一旦要按姿势图复现姿势，姿势图必须占第一张，脸图顺延（见路线一「图序铁律」）。
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
| 姿势丢（变站姿） | 姿势图放在了脸图后面，被当成了要保留的原图；或只给骨架没写姿势文字 | 姿势图挪到第一张；同时补一句姿势描述 |
| 明明给了骨架却没生效 | 图序反了，静默失败不报错 | 按路线一「图序铁律」把姿势图放 `images[0]` |
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
| CN 加脸图能同时锁姿势和身份 | 推翻，源码视觉槽位传空列表，CN 无任何身份输入口 |
| 骨架图放哪都不影响 | 推翻，放第二张会静默失效；必须放 `images[0]`（2026-11-27） |
| 多图必然稀释身份 | 有限条件成立：三图 + 双 LoRA 可用 |
| 提分辨率消除串味 | 完全无效，只涨显存 |
| 拼图法做多参考 | 脸部出现拼贴异物 |
| 完整四层身形锚点 | 反而恶化胯位，只用胯位空间参照 |

## 资源库 LoRA 全表（9 个，2026-11-27 核实）

用任何 LoRA 前先查这张表。**三项缩放是起点不是定值**，按任务调；但触发词和「能不能配这个路线」是硬约束，不要自行发挥。

### 一、主方案三件（姿势+身份路线，只有这三个该一起用）

| 文件 | 内嵌名 | 作用 | 强度 | 说明 |
|---|---|---|---|---|
| `mva-angles.safetensors` | qwen21_multiple_angles_v2 | **管全身入画 + 相机角度** | 0.6 | 没有它，单图 edit 只出半身特写。prompt 需以 `<mva> full body view.` 开头 |
| `vnccs-pose.safetensors` | VNCCS_QI2_PoseStudioV2 | **执行文字描述的姿势**，含深蹲/举臂/盘腿 | 0.5 | 实测 0.3→0.390 / 0.5→0.720 / 0.7→0.461，0.5 最优，不必调高 |
| `consistency-lora.safetensors` | qwen21_consistency_v1 | **抑制换姿势/换 seed 的身份漂移** | 0.5 | 极端姿势必带。举臂 seed333 从 0.038 救到 0.464，无它该 seed 直接崩 |

**禁忌**：三件之外不要再加任何 LoRA。实测附加非核心 LoRA 身份全部降分（见下）。

### 二、风格类（纯文生图用，禁止叠加到身份路线）

| 文件 | 出处 | 作用 | 触发词 | 强度 |
|---|---|---|---|---|
| `turbo8_lora_step2500.safetensors` | [chriswritescode/Turbo8](https://huggingface.co/chriswritescode/Turbo8-LoRA-Qwen-Image-2.1) | **8 步蒸馏**（DMD2 + 轨迹回归），base 40 步压到 8 步、CFG=1，rank 128 | 无 | 1.0 |
| `anything2real.safetensors` | 内嵌名 anime2real | **去二次元感、增真实感**，毛孔雀斑最自然 | 无 | 0.3 |
| `photo-aesthetics-v2.safetensors` | [SimpleTuner/photo-aesthetics-v2](https://huggingface.co/SimpleTuner/Qwen-Image-2.1-LoRA-photo-aesthetics-v2) | **边缘锐利通透**，产品/建筑/杂志硬照。5 万步、rank 32 | 无 | 0.5（官方 1.0） |
| `casual-phone-photo.safetensors` | [19nbrown/casual-phone-photo-style-lora](https://huggingface.co/19nbrown/qwen-image-2.1-casual-phone-photo-style-lora) | **最平滑干净的网红脸**（grain 2.34，全场最平滑）。126 图、rank 32 | **`lbxstyle`（必需）** | 官方 0.8；本机预设用 0.5 |

**`casual-phone-photo` 必须在 prompt 里写 `lbxstyle`**，否则风格不激活——等于白挂。插件不会自动注入，**由 Agent 在写 prompt 时手动加上**（例如 `lbxstyle, 一个女生的日常自拍…`）。这是本机当前唯一需要触发词的 LoRA。

内置三个风格预设就是这几个的组合：

| 按钮 | 组合 |
|---|---|
| 纪实真实 | turbo8@0.5 + anything2real@0.3 |
| 商业锐利 | turbo8@0.3 + photo-aesthetics@0.5 |
| 干净美颜 | turbo8@0.5 + casual-phone@0.5（**注意：预设不含 lbxstyle**，用它要自己补触发词，或把强度提到 0.8） |

### 三、专项用途

| 文件 | 内嵌名 | 作用 | 强度 | 建议 |
|---|---|---|---|---|
| `anyangle.safetensors` | QI2.1_AnyAngle | **只换相机角度**，比 ControlNet 轻 | 0.8–1.0 | 身份 0.526，机位跟随弱，需文字配合 |
| `outfit-swap.safetensors` | qwen21_outfit_v1b | 换装专用 | — | **不推荐**：身份仅 0.372，且需第二张服装图。用文字描述服装更稳 |

### 四、附加 LoRA 的降分实测（为什么不许叠）

在双 LoRA 基准（0.7192）上再加一个 @0.3：

| 附加项 | 身份 |
|---|---|
| 基准（mva + vnccs + consistency） | **0.719** |
| + turbo8@0.3 | 0.706 |
| + photo-aesthetics@0.3 | 0.695 |
| + casual-phone@0.3 | 0.694 |
| + anything2real@0.3 | 0.690 |
| + natural-exposure@0.3 | 0.689 |
| + omni-lora@0.3 | 0.582 |

**全部降分**。要别的效果就**另起一个任务**，不要在同一张图上既要身份又要风格。

### 五、turbo8 的本机限制（重要）

官方固定配方是 `steps 8 / cfg 1 / euler / simple + shift_terminal=None + ModelSamplingFlux(max_shift 0.6935)`，模型卡明确写「任一项改动都没有收益」。

本机实际情况（2026-11-27 查证）：

- mflux 调度器只有 `linear`、`flow_match_euler_discrete`、`seedvr2_euler`，**没有 `simple`**
- mflux 源码 **turbo8 零命中**，无内置配方
- `qwen21_scheduler.py` 是给 **Viggle turbo**（6 步）写的，不是 turbo8 的 8 步表

**结论**：步数与 CFG 能对上，调度器那套对不上。**待确认**是否已造成画质劣化——主方案不依赖 turbo8，只在纯文生图打底时用；若要用它追求速度，先做一次 A/B 对比。
