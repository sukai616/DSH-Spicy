# Fork: sukai616/DSH-Spicy

Personal fork of [kingcharleslzy-ai/DSH-Spicy](https://github.com/kingcharleslzy-ai/DSH-Spicy)
(`dsh-qwen-studio`), tuned for Apple Silicon local MLX inference (M3 / 24 GB).

Upstream stays the source of truth for features. This fork only carries the
changes listed below. When syncing from upstream, re-apply them afterwards.

## 1. Resolution ceiling 2048 → 4096

Upstream caps generation at 2048 per side. The model itself decodes up to
2560² on this machine, so the artificial cap was raised to 4096 and the real
limit is now determined by the device.

Touched: `src/generation-parameters.ts`, `src/presets.ts`, `src/remote.ts`,
`src/client/creation-draft.ts`, `backend/server.py`.

Measured on M3/24GB (8 steps, Turbo):

| Size | MP | Time | Decode |
|---|---|---|---|
| 1024×1280 | 1.31 | 6.2 min | ok |
| 1536×2048 | 3.15 | 17.0 min | ok |
| 2048² | 4.19 | 22.6 min | ok |
| 2560² | 6.55 | 46.1 min | ok (ceiling) |
| 2720² | 7.42 | ~47 min | Metal OOM at decode |
| 3072² | 9.44 | ~45 min | Metal OOM at decode |

The bottleneck is VAE decode, not sampling: 2720² and above finish all 8 steps
and then fail while decoding to pixels.

## 2. Default steps 40 → 8

Upstream defaults to 40 steps, which assumes a non-distilled checkpoint. The
local weight is the Turbo distillation; 8 steps is its design point and
40 steps only amplifies quantization noise (measured: 1580 s, edge_std 5.87,
grain 3.14, flagged `heavy-grain` vs 484 s / 3.82 / 1.94 at 8 steps).

Touched: `src/generation-parameters.ts`, `src/remote.ts`,
`src/generation-request.ts`, `src/workspace-tools.ts`,
`src/client/creation-draft.ts`, `backend/server.py`, `tests/creation-draft.spec.ts`.

## 3. HuggingFace offline is opt-out instead of forced

`backend/server.py` used to hard-set `HF_HUB_OFFLINE=1`, which blocks
downloading ControlNet Union and LoRAs at runtime. Now it uses
`setdefault('HF_HUB_OFFLINE', '0')` so the caller can still force offline via
the environment variable, but the default allows fetches.

## 4. Gallery timeline view

New front-end module `src/client/gallery-timeline.ts` plus a toggle in the
gallery toolbar. Groups jobs by local calendar day (今天 / 昨天 / 前天 / 月日 周X),
newest day first, newest item first inside each day. Each day header shows the
count and collapses on click. The choice persists in
`localStorage["qwen-studio-gallery-timeline"]`.

Files: `src/client/gallery-timeline.ts` (new), `src/client/studio.tsx`,
`src/client/style.ts`.

## Building

```bash
npm ci --ignore-scripts
npm run build          # tsc && tsdown
QWEN_TEST_PYTHON=/path/to/python3.12 npm test
```

`QWEN_TEST_PYTHON` needs Python 3.10+ with Pillow and numpy.
