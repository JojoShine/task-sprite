import { useState } from "react";
import { ArrowLeft, CaretLeft, CaretRight, Check } from "@phosphor-icons/react";
import { plannedLooks, interfaceSkins, hasLicensedLooks } from "./looks";
import { LookPreview } from "./LookPreview";
import { api, message } from "./api";
import type { PetId, SkinId, Settings, Snapshot } from "./types";
export function Wardrobe({ settings, looksExpiresAt, onActivate, onChange, onClose }: {
  settings: Settings;
  looksExpiresAt?: string | null;
  onActivate?: () => void;
  onChange: (next: Snapshot) => void;
  onClose: () => void;
}) {
  const unlocked = hasLicensedLooks(looksExpiresAt);
  const [category, setCategory] = useState<"pets" | "skins">("pets");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function selectLook(patch: { pet?: PetId; skin?: SkinId }) {
    setBusy(true); setError("");
    try { onChange(await api.preferences(patch)); }
    catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  const items = category === "pets" ? plannedLooks : interfaceSkins;
  const pageCount = Math.ceil(items.length / 4);
  return <section className="wardrobe" aria-label="精灵衣橱">
    <div className="section-heading"><h2>精灵衣橱</h2><button className="text-button icon-text" aria-label="返回设置" onClick={onClose}><ArrowLeft size={16} />返回</button></div>
    <p className="wardrobe-intro">六位专属精灵与四款整体皮肤独立选择，可自由搭配。免费伙伴在设置中切换。</p>
    <div className="wardrobe-tabs" role="group" aria-label="装扮分类">
      <button aria-pressed={category === "pets"} onClick={() => { setCategory("pets"); setPage(0); setError(""); }}>专属精灵 {plannedLooks.length}</button>
      <button aria-pressed={category === "skins"} onClick={() => { setCategory("skins"); setPage(0); setError(""); }}>界面皮肤 {interfaceSkins.length}</button>
    </div>
    <div className="look-grid">
      {items.slice(page * 4, page * 4 + 4).map(item => <button className={`look-tile ${(item.kind === "皮肤" ? settings.skin === item.id : settings.pet === item.id) ? "selected" : ""}`} key={item.id} aria-label={`${item.kind === "皮肤" ? "选择皮肤" : "选择装扮"} ${item.name}`} aria-pressed={(item.kind === "皮肤" ? settings.skin === item.id : settings.pet === item.id)} disabled={busy} onClick={() => unlocked ? void selectLook(item.kind === "皮肤" ? { skin: item.id as SkinId } : { pet: item.id }) : onActivate?.()}>
        {(item.kind === "皮肤" ? settings.skin === item.id : settings.pet === item.id) && <Check size={14} className="look-check" />}<LookPreview look={item} still={settings.reduceMotion} /><strong>{item.name}</strong><small>{item.kind} · {unlocked ? (item.kind === "皮肤" ? settings.skin === item.id : settings.pet === item.id) ? "已选择" : "已解锁" : "需激活"}</small>
      </button>)}
    </div>
    {pageCount > 1 && <nav className="task-pager look-pager" aria-label="装扮翻页"><button aria-label="上一页装扮" disabled={page === 0} onClick={() => setPage(page - 1)}><CaretLeft size={19} /></button><span>{page + 1} / {pageCount}</span><button aria-label="下一页装扮" disabled={page === pageCount - 1} onClick={() => setPage(page + 1)}><CaretRight size={19} /></button></nav>}
    {category === "skins" && settings.skin && settings.skin !== "default" && <button className="text-button" disabled={busy} onClick={() => void selectLook({ skin: "default" })}>恢复默认皮肤</button>}
    {error && <p className="error" role="alert">{error}</p>}
    <p className="wardrobe-note">有效授权支持离线装扮；暂停同步不会锁定。</p>
  </section>;
}
