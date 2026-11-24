declare module "dsh-qwen-mlx-studio/video-host" {
  export function apply(ctx: import("@deepseek-ai/cordis").Context): void;
}
declare module "dsh-qwen-mlx-studio/film-host" {
  export function apply(ctx: import("@deepseek-ai/cordis").Context): void;
}
declare module "dsh-qwen-mlx-studio/video-client" {
  export function VideoPage(): import("react").ReactElement;
  export function installVideoPlayers(ctx: import("@deepseek-ai/cordis").Context): void;
}
