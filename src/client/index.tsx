import { useEffect, useState } from "react";
import { Images } from "lucide-react";
import type {} from "@deepseek-ai/dsh-client-ui-slots";
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings-plugins/client";
import type { Config } from "../config.js";
import {
  ConversationProgress,
  progressDefinition,
  PROGRESS_KIND,
} from "./conversation-progress.js";
import { Studio } from "./studio.js";
import { STYLE } from "./style.js";
import {
  ConversationImage,
  resultDefinition,
  RESULT_KIND,
} from "./conversation-result.js";
import { usePrivacyGallery, setPrivacyEnabled } from "./gallery-preferences.js";
import { PathField } from "./path-field.js";
import { request } from "./api.js";
import { Settings, type Scope } from "./settings.js";
export const inject = ["slots", "connection", "remote"];
export function apply(ctx: Context) {
  const forms = ctx.get("configForms") as
      | { get(id: string): Scope }
      | undefined,
    scope = forms?.get("qwen-studio");
  const register = ctx.slots.register.bind(ctx.slots) as (
    options: object,
    component: unknown,
  ) => () => void;
  const mount = ctx.slots.inject.bind(ctx.slots) as (
    key: string,
    create: () => () => void,
  ) => void;
  mount("plugins.bundle.config", () =>
    register(
      {
        name: "plugins.bundle.config",
        key: "dsh-qwen-mlx-studio",
        inject: () => ({ scope }),
      },
      Settings,
    ),
  );
  (
    ctx.inject as unknown as (
      services: string[],
      cb: (owner: Context) => void,
    ) => void
  )(["uiConversation"], (owner) => {
    const conversation = owner.get("uiConversation") as {
      events: { register(definition: unknown): () => void };
    };
    owner.effect(
      () => conversation.events.register(progressDefinition),
      "image progress",
    );
    owner.effect(
      () => conversation.events.register(resultDefinition),
      "image result",
    );
    const reg = owner.slots.register.bind(owner.slots) as (
      options: object,
      component: unknown,
    ) => () => void;
    owner.slots.inject("conversation.chat.node", () =>
      reg(
        {
          name: "conversation.chat.node",
          key: PROGRESS_KIND,
          inject: (sessionId: string) => ({ sessionId }),
        },
        ConversationProgress,
      ),
    );
    owner.slots.inject("conversation.chat.node", () =>
      reg(
        {
          name: "conversation.chat.node",
          key: RESULT_KIND,
          inject: () => ({}),
        },
        ConversationImage,
      ),
    );
  });

  mount("main", () =>
    register(
      {
        name: "main",
        key: "qwen-studio",
        inject: () => ({}),
      },
      StudioPage,
    ),
  );
  mount("sidebar.panellist", () =>
    register(
      {
        name: "sidebar.panellist",
        id: "qwen-studio",
        order: 10,
        label: "图像工坊",
      },
      StudioIcon,
    ),
  );
}
function StudioIcon({ size = 16 }: { size?: number }) {
  return <Images size={size} aria-hidden="true" />;
}
function StudioPage() {
  // 顶部标题栏：视频模块已移除，这里只显示工坊名，不再渲染图像/视频切换。
  // 内边距用固定值而不引用 --dsh-frame-top-clearance：宿主用它给 .mainPanel
  // 算补偿 padding-top，改它会连带改变详情弹窗的定位盒高度，令底部露出一级内容。
  return <div style={{height: "100%", display: "flex", flexDirection: "column", minHeight: 0}}>
    {/* 左右 24px 与下方 .q2-brand 一致，标题和「图库」左对齐；不画分隔线 */}
    <nav aria-label="图像工坊" style={{display: "flex", gap: 6, padding: "24px 24px 8px"}}>
      <span style={{fontWeight: 600}}>图像工坊</span>
    </nav>
    <div style={{flex: 1, minHeight: 0}}><Studio /></div>
  </div>;
}
