import { ArrowLeft, ChartBar, Cloud, Crown, Palette, TextAlignLeft, LockKey } from "@phosphor-icons/react";
import type { PremiumLook } from "./looks";
import { LookPreview } from "./LookPreview";
const benefits = [
  { title: "一段话拆解任务", detail: "在小程序把一段话整理为多条任务。", Icon: TextAlignLeft },
  { title: "更多角色与主题", detail: "解锁新增角色、皮肤和主题装扮。", Icon: Palette },
  { title: "个人多设备同步", detail: "小程序与电脑同步状态，默认3台电脑。", Icon: Cloud },
  { title: "任务统计与阶段汇报", detail: "查看任务统计，AI生成阶段汇报。", Icon: ChartBar },
];
export function Membership({ onClose, backLabel, look }: {
  onClose: () => void;
  backLabel: string;
  look?: PremiumLook;
}) {
  return <section className="membership" aria-label="年卡能力说明">
    <div className="section-heading">
      <h2>Task Sprite 年卡</h2>
      <button className="text-button icon-text" onClick={onClose} aria-label={backLabel}><ArrowLeft size={16} />返回</button>
    </div>
    <p className="membership-eyebrow"><Crown size={16} />年卡预览 · 尚未开放</p>
    {look ? <div className="membership-selection"><LookPreview look={look} /><div><strong>{look.name}</strong><span><LockKey size={13} />未解锁 · {look.kind}预览</span></div></div>
      : <p className="membership-line">手机上记下来，<br />桌宠陪着做。</p>}
    <p className="membership-intro">当前为免费本地版。以下年卡能力正在筹备，尚未上线。</p>
    <div className="membership-facts"><span>按年付费</span><span>默认3台电脑</span><span>原卡可扩容</span></div>
    <p className="membership-intro">上线后凭数字卡号关联设备，小程序不占电脑名额；续费和设备扩容均沿用原卡。</p>
    <ul className="membership-benefits">{benefits.map(({ title, detail, Icon }) => <li key={title}><Icon size={21} /><div><h3>{title}</h3><p>{detail}</p></div></li>)}</ul>
    <div className="membership-checkout">
      <button className="primary" disabled aria-describedby="checkout-status">购买暂未开放</button>
      <p id="checkout-status">价格与支付入口将在落地页上线后公布。</p>
    </div>
    <p className="membership-free">现有四位伙伴、本地任务、提醒和CSV导出继续免费。</p>
  </section>;
}
