import { useState } from "react";
import { ArrowLeft, CaretLeft, CaretRight, Check, Crown, LockKey } from "@phosphor-icons/react";
import { pets, Sprite } from "./Pet";
import { premiumLooks, type PremiumLook } from "./looks";
import { LookPreview } from "./LookPreview";
import { Membership } from "./Membership";
import { api, message } from "./api";
import type { PetId, Settings, Snapshot } from "./types";
export function Wardrobe({ settings, onChange, onClose }: {
  settings: Settings;
  onChange: (next: Snapshot) => void;
  onClose: () => void;
}) {
  const [tier, setTier] = useState<"premium" | "free">("premium");
  const [page, setPage] = useState(0);
  const [showMembership, setShowMembership] = useState(false);
  const [look, setLook] = useState<PremiumLook>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function selectPet(pet: PetId) {
    setBusy(true); setError("");
    try { onChange(await api.preferences({ pet })); }
    catch (e) { setError(message(e)); }
    finally { setBusy(false); }
  }
  if (showMembership) return <Membership look={look} backLabel="返回衣橱" onClose={() => setShowMembership(false)} />;
  const pageCount = Math.ceil(premiumLooks.length / 4);
  return <section className="wardrobe" aria-label="精灵衣橱">
    <div className="section-heading"><h2>精灵衣橱</h2><button className="text-button icon-text" aria-label="返回任务" onClick={onClose}><ArrowLeft size={16} />返回</button></div>
    <p className="wardrobe-intro">四位免费伙伴，更多年卡装扮等你来看看。</p>
    <div className="wardrobe-tabs" role="group" aria-label="装扮分类">
      <button aria-pressed={tier === "free"} onClick={() => { setTier("free"); setPage(0); setError(""); }}>免费伙伴 {pets.length}</button>
      <button aria-pressed={tier === "premium"} onClick={() => { setTier("premium"); setPage(0); setError(""); }}><LockKey size={13} />年卡装扮 {premiumLooks.length}</button>
    </div>
    <div className="look-grid">
      {tier === "free" ? pets.map(pet => <button className={`look-tile ${settings.pet === pet.id ? "selected" : ""}`} key={pet.id} aria-label={`选择免费伙伴 ${pet.name}`} aria-pressed={settings.pet === pet.id} disabled={busy} onClick={() => void selectPet(pet.id)}>
        {settings.pet === pet.id && <Check size={14} className="look-check" />}
        <span className="look-preview"><Sprite pet={pet.id} still /></span><strong>{pet.name}</strong><small>免费伙伴</small>
      </button>) : premiumLooks.slice(page * 4, page * 4 + 4).map(item => <button className="look-tile locked" key={item.id} aria-label={`预览未解锁装扮 ${item.name}`} onClick={() => { setLook(item); setShowMembership(true); }}>
        <LockKey size={13} className="look-check" /><LookPreview look={item} /><strong>{item.name}</strong><small>{item.kind} · 未解锁</small>
      </button>)}
    </div>
    {tier === "premium" && <nav className="task-pager look-pager" aria-label="装扮翻页"><button aria-label="上一页装扮" disabled={page === 0} onClick={() => setPage(page - 1)}><CaretLeft size={19} /></button><span>{page + 1} / {pageCount}</span><button aria-label="下一页装扮" disabled={page === pageCount - 1} onClick={() => setPage(page + 1)}><CaretRight size={19} /></button></nav>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="wardrobe-note"><span>{tier === "premium" ? "年卡装扮当前仅供预览。" : "免费伙伴可直接切换。"}</span><button className="text-button icon-text" onClick={() => { setLook(undefined); setShowMembership(true); }}><Crown size={15} />查看年卡能力</button></div>
  </section>;
}
