import { test, expect } from "vitest";
import {
  LORA_STYLES,
  applyStyle,
  styleActive,
} from "../src/client/advanced-settings.js";
import type { CreationDraft } from "../src/client/creation-draft.js";

type Lora = CreationDraft["loras"];
const style = (id: string) => LORA_STYLES.find((s) => s.id === id)!;
const catalog = [
  { name: "turbo8", path: "/l/turbo8_lora_step2500.safetensors" },
  { name: "anything2real", path: "/l/anything2real.safetensors" },
  { name: "photo", path: "/l/photo-aesthetics-v2.safetensors" },
];
const paths = (loras: Lora) => loras.map((l) => l.path).sort();

test("applying a style fills its combination and can be toggled off", () => {
  const empty: Lora = [];
  const applied = applyStyle(style("real"), catalog, empty);

  expect(paths(applied)).toEqual([
    "/l/anything2real.safetensors",
    "/l/turbo8_lora_step2500.safetensors",
  ]);
  expect(applied.find((l) => l.path.includes("turbo8"))?.scale).toBe(0.5);
  expect(applied.find((l) => l.path.includes("anything2real"))?.scale).toBe(0.3);
  expect(styleActive(style("real"), applied)).toBe(true);

  // 再点一次必须取消，而不是幂等重设
  const cleared = applyStyle(style("real"), catalog, applied);
  expect(cleared).toEqual([]);
  expect(styleActive(style("real"), cleared)).toBe(false);
});

test("a partially matching style tops up instead of toggling off", () => {
  const partial: Lora = [
    { path: "/l/turbo8_lora_step2500.safetensors", name: "turbo8", scale: 0.8 },
  ];
  expect(styleActive(style("real"), partial)).toBe(false);
  const filled = applyStyle(style("real"), catalog, partial);
  expect(paths(filled)).toEqual([
    "/l/anything2real.safetensors",
    "/l/turbo8_lora_step2500.safetensors",
  ]);
  // 已存在的那一项权重也要被预设覆盖
  expect(filled.find((l) => l.path.includes("turbo8"))?.scale).toBe(0.5);
});

test("switching styles replaces the previous combination", () => {
  const real = applyStyle(style("real"), catalog, []);
  const commercial = applyStyle(style("commercial"), catalog, real);
  expect(paths(commercial)).toEqual([
    "/l/photo-aesthetics-v2.safetensors",
    "/l/turbo8_lora_step2500.safetensors",
  ]);
  expect(styleActive(style("real"), commercial)).toBe(false);
});

test("the clear style always empties the list", () => {
  const some: Lora = [{ path: "/l/x.safetensors", name: "x", scale: 1 }];
  expect(applyStyle(style("none"), catalog, some)).toEqual([]);
  expect(styleActive(style("none"), [])).toBe(true);
  expect(styleActive(style("none"), some)).toBe(false);
});
