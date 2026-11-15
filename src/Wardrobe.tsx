import { useState } from "react";
import { ArrowLeft, CaretLeft, CaretRight, Check, Palette } from "@phosphor-icons/react";
import { pets, Sprite } from "./Pet";
import { plannedLooks, hasLicensedLooks, type PlannedLook } from "./looks";
import { LookPreview } from "./LookPreview";
import { api, message } from "./api";
import type { PetId, Settings, Snapshot } from "./types";
export function Wardrobe({ settings, looksExpiresAt, onActivate, onChange, onClose }: {
  settings: Settings;
  looksExpiresAt?: string | null;
  onActivate?: () => void;
  onChange: (next: Snapshot) => void;
  onClose: () => void;
}) {
  const unlocked = hasLicensedLooks(looksExpiresAt);
  const [tier, setTier] = useState<"preview" | "free">("free");
  const [page, setPage] = useState(0);
  const [look, setLook] = useState<PlannedLook>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function selectPet(pet: PetId) {
    setBusy(true); setError("");
    try { onChange(await api.preferences({ pet })); }
    catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  if (look) return <section className="wardrobe" aria-label="装扮预览">
    <div className="section-heading"><h2>{look.name}</h2><button className="text-button icon-text" aria-label="返回衣橱" onClick={() => setLook(undefined)}><ArrowLeft size={16} />返回</button></div>
    <div className="look-detail"><LookPreview look={look} still={settings.reduceMotion} /><p>{unlocked ? "已激活授权，可离线使用。" : "此装扮需要有效授权，免费伙伴始终可用。"}</p>
      {unlocked ? <button className="primary" disabled={busy || settings.pet === look.id} onClick={() => void selectPet(look.id)}>{settings.pet === look.id ? `已选择${look.name}` : `使用${look.name}`}</button> : <button className="primary" onClick={onActivate}>激活授权</button>}
      {error && <p className="error" role="alert">{error}</p>}</div>
  </section>;
  const pageCount = Math.ceil(plannedLooks.length / 4);
  return <section className="wardrobe" aria-label="精灵衣橱">
    <div className="section-heading"><h2>精灵衣橱</h2><button className="text-button icon-text" aria-label="返回任务" onClick={onClose}><ArrowLeft size={16} />返回</button></div>
    <p className="wardrobe-intro">四位伙伴免费使用，有效授权解锁六款装扮。</p>
    <div className="wardrobe-tabs" role="group" aria-label="装扮分类">
      <button aria-pressed={tier === "free"} onClick={() => { setTier("free"); setPage(0); setError(""); }}>免费伙伴 {pets.length}</button>
      <button aria-pressed={tier === "preview"} onClick={() => { setTier("preview"); setPage(0); setError(""); }}><Palette size={13} />授权装扮 {plannedLooks.length}</button>
    </div>
    <div className="look-grid">
      {tier === "free" ? pets.map(pet => <button className={`look-tile ${settings.pet === pet.id ? "selected" : ""}`} key={pet.id} aria-label={`选择免费伙伴 ${pet.name}`} aria-pressed={settings.pet === pet.id} disabled={busy} onClick={() => void selectPet(pet.id)}>
        {settings.pet === pet.id && <Check size={14} className="look-check" />}
        <span className="look-preview"><Sprite pet={pet.id} still /></span><strong>{pet.name}</strong><small>免费伙伴</small>
      </button>) : plannedLooks.slice(page * 4, page * 4 + 4).map(item => <button className={`look-tile ${settings.pet === item.id ? "selected" : ""}`} key={item.id} aria-label={`预览装扮 ${item.name}`} onClick={() => setLook(item)}>
        <Palette size={13} className="look-check" /><LookPreview look={item} still={settings.reduceMotion} /><strong>{item.name}</strong><small>{item.kind} · {unlocked ? settings.pet === item.id ? "已选择" : "已解锁" : "需激活"}</small>
      </button>)}
    </div>
    {tier === "preview" && <nav className="task-pager look-pager" aria-label="装扮翻页"><button aria-label="上一页装扮" disabled={page === 0} onClick={() => setPage(page - 1)}><CaretLeft size={19} /></button><span>{page + 1} / {pageCount}</span><button aria-label="下一页装扮" disabled={page === pageCount - 1} onClick={() => setPage(page + 1)}><CaretRight size={19} /></button></nav>}
    {error && <p className="error" role="alert">{error}</p>}
    <p className="wardrobe-note">{tier === "preview" ? "有效授权支持离线装扮；暂停同步不会锁定。" : "四位伙伴可直接切换。"}</p>
  </section>;
}
