import { useState } from 'react';
import { Palette, Play } from '@phosphor-icons/react';
import { api, message } from './api';
import { Sprite, pets } from './Pet';
import type { Settings, Snapshot, VisualState } from './types';
export function CompanionSettings({ settings, onChange, onWardrobe }: { settings: Settings; onChange: (snapshot: Snapshot) => void; onWardrobe?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');
  const [showActions, setShowActions] = useState(false);
  return <section className="companion-settings" aria-label="伙伴与装扮">
    <div className="footer-label"><h3>伙伴与装扮</h3>{onWardrobe && <button className="text-button icon-text" onClick={onWardrobe}><Palette size={16}/>更多装扮</button>}</div>
    <div className="pet-options">{pets.map(pet=><button key={pet.id} className={`pet-option ${settings.pet===pet.id?'selected':''}`} disabled={busy} aria-label={`选择${pet.name}`} aria-pressed={settings.pet===pet.id} onClick={async()=>{setBusy(true);setError('');try{onChange(await api.preferences({pet:pet.id}));}catch(e){setError(message(e));}finally{setBusy(false);}}}><Sprite pet={pet.id} still/><span>{pet.name}</span></button>)}</div>
    <button className="text-button icon-text" aria-label="试试动作" aria-expanded={showActions} onClick={()=>setShowActions(!showActions)}><Play size={16}/>试试动作</button>
    {showActions && <div className="animation-controls" aria-label="动作预览">{([['idle','待机'],['reminder','提醒'],['celebrate','庆祝'],['rest','休息'],['working','工作'],['interaction','互动']] as const).map(([id,label])=><button key={id} aria-label={`预览${label}`} onClick={async()=>{try{await api.preview(id as VisualState);setPreview(`正在演示${label} · 5秒后恢复`);}catch(e){setError(message(e));}}}>{label}</button>)}</div>}
    {preview && <p className="micro" role="status">{preview}</p>}{error && <p className="error" role="alert">{error}</p>}
  </section>;
}
