import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, RefreshCw, Trash2 } from "lucide-react";
import type { AssetKind } from "../assets.js";
import type { Resource, ResourceCatalog } from "../resources.js";
import { AssetUpload } from "./asset-upload.js";
import { imageURL, request } from "./api.js";
import { ParameterHelp } from "./parameter-help.js";

/** 资源库：只列本机导入的单张素材；删除即真删托管副本，外部文件不动。 */
const GROUPS = [
  {
    kind: "source",
    label: "参考图",
    help: "生成时的源图与参考图。多图编辑按你选择的顺序依次编号为 <image1>、<image2>。",
  },
  {
    kind: "control",
    label: "控制图",
    help: "结构控制用的线稿、深度或姿态图；启用结构控制后才有意义。",
  },
  {
    kind: "mask",
    label: "蒙版",
    help: "局部重绘用的黑白蒙版，白色区域会被重绘，黑色区域保留。",
  },
] as const;
const ORIGIN = {
  imported: "已导入",
  default: "默认文件夹",
  custom: "自定义文件夹",
  gallery: "图库作品",
};
const size = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function ResourceManager({ onClose }: { onClose(): void }) {
  const [catalog, setCatalog] = useState<ResourceCatalog>({
      items: [],
      warnings: [],
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<Resource | null>(null),
    [importKind, setImportKind] = useState<AssetKind>("source"),
    [loaded, setLoaded] = useState(false);
  const refresh = useCallback(
    () =>
      request<ResourceCatalog>("resources")
        .then((value) => {
          setCatalog(value);
          setLoaded(true);
        })
        .catch((e) => {
          setLoaded(true);
          setError(e instanceof Error ? e.message : String(e));
        }),
    [],
  );
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const items = catalog.items.filter((r) => r.origin !== "gallery"),
    of = (kind: string) => items.filter((r) => r.kind === kind),
    loras = of("lora"),
    total = items.reduce((sum, r) => sum + r.bytes, 0);
  async function remove(resource: Resource) {
    setBusy(true);
    setError("");
    try {
      await request("resources", {
        action: "delete",
        id: resource.id,
        confirm: true,
      });
      setPending(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="q2-overlay q2-detail"
      role="dialog"
      aria-modal="true"
      aria-label="资源库"
    >
      <header>
        <button aria-label="返回图库" onClick={onClose}>
          <ArrowLeft />
          返回图库
        </button>
        <strong>
          资源库
          <ParameterHelp
            name="资源库"
            text="本机导入的参考素材。添加的图片会复制到图库目录下的 assets/images，删除即真删这份副本，原文件不受影响。自定义 LoRA 目录里的权重只列出、不提供删除。生成的作品请在「图库」里管理。"
          />
        </strong>
        <button onClick={() => void refresh()} disabled={busy}>
          <RefreshCw />
          刷新
        </button>
      </header>
      <div className="q2-advanced-page q2-effects-page">
        <p className="q2-muted">
          {items.length} 个素材 · 共 {size(total)}。生成的作品在图库，不在这里。
        </p>
        <div className="q2-import-toolbar">
          <span className="q2-field-title">
            导入图片
            <ParameterHelp
              name="导入图片"
              text="从本机选择 PNG、JPEG 或 WebP，一次最多 8 张、单张不超过 64MB。导入会复制一份到图库目录，原文件保持不变；同内容同用途的图片会自动复用已有条目。"
            />
          </span>
          <select
            aria-label="导入用途"
            value={importKind}
            onChange={(e) => setImportKind(e.target.value as AssetKind)}
            disabled={busy}
          >
            <option value="source">作为参考图</option>
            <option value="control">作为控制图</option>
            <option value="mask">作为蒙版</option>
          </select>
          <AssetUpload
            kind={importKind}
            label="选择图片导入"
            maxFiles={8}
            disabled={busy}
            onError={setError}
            onAssets={() => void refresh()}
          />
        </div>
        {error && (
          <p className="q2-effect-error" role="alert">
            {error}
          </p>
        )}
        {catalog.warnings.length > 0 && (
          <p className="q2-effect-note" role="status">
            {catalog.warnings.join("；")}
          </p>
        )}
        {!loaded && <p className="q2-muted">正在读取资源清单…</p>}
        {loaded &&
          GROUPS.map((group) => {
            const list = of(group.kind);
            return (
              <section key={group.kind}>
                <div className="q2-effect-heading">
                  <h3 className="q2-field-title">
                    {group.label}
                    <span className="q2-effect-tag">{list.length}</span>
                    <ParameterHelp name={group.label} text={group.help} />
                  </h3>
                </div>
                {list.length > 0 ? (
                  <div className="q2-lora-list">
                    {list.map((resource) => (
                      <div className="q2-lora-item" key={resource.id}>
                        <img
                          src={imageURL(resource.id)}
                          alt=""
                          loading="lazy"
                          style={{
                            width: 44,
                            height: 44,
                            objectFit: "contain",
                            borderRadius: 4,
                            background: "var(--q-surface)",
                          }}
                        />
                        <span className="q2-inline-check">
                          <span title={resource.name}>{resource.name}</span>
                        </span>
                        <small className="q2-muted">{size(resource.bytes)}</small>
                        <button
                          type="button"
                          aria-label={"删除 " + resource.name}
                          disabled={busy}
                          onClick={() => setPending(resource)}
                        >
                          <Trash2 />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="q2-muted">
                    还没有{group.label}。用上方「选择图片导入」添加。
                  </p>
                )}
              </section>
            );
          })}
        {loaded && (
          <section>
            <div className="q2-effect-heading">
              <h3 className="q2-field-title">
                LoRA
                <span className="q2-effect-tag">{loras.length}</span>
                <ParameterHelp
                  name="LoRA 风格"
                  text="托管副本、图库下的 loras 文件夹与自定义 LoRA 目录合并列出。这里只浏览；添加与启用请在创作页的高级设置里操作，外部目录的权重不会在这里被删除。"
                />
              </h3>
            </div>
            {loras.length > 0 ? (
              <div className="q2-lora-list">
                {loras.map((resource) => (
                  <div className="q2-lora-item" key={resource.id}>
                    <span className="q2-inline-check">
                      <span title={resource.name}>{resource.name}</span>
                    </span>
                    <small className="q2-muted">
                      {ORIGIN[resource.origin]} · {size(resource.bytes)}
                    </small>
                  </div>
                ))}
              </div>
            ) : (
              <p className="q2-muted">没有可用的 LoRA。</p>
            )}
          </section>
        )}
      </div>
      {pending && (
        <div
          className="q2-confirm-backdrop"
          role="alertdialog"
          aria-modal="true"
          aria-label="确认删除资源"
        >
          <div className="q2-confirm">
            <Trash2 size={23} />
            <h3>删除「{pending.name}」？</h3>
            <p>
              这份导入副本会永久删除，原文件不受影响。已选用的草稿需要重新选择。
            </p>
            <div className="q2-actions">
              <button autoFocus onClick={() => setPending(null)}>
                取消
              </button>
              <button
                className="q2-danger-fill"
                disabled={busy}
                onClick={() => void remove(pending)}
              >
                永久删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
