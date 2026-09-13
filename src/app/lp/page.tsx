import Link from "next/link";
import Image from "next/image";
import { IBM_Plex_Mono, Shippori_Mincho_B1, Zen_Kaku_Gothic_New } from "next/font/google";
import { createAdminClient } from "@/lib/supabase/server";
import { pricingFromRows, withTax } from "@/lib/pricing";
import { yen } from "@/lib/format";
import { OPERATOR } from "@/lib/legal";
import { LP } from "@/content/lp";
import "./lp.css";

const display = Zen_Kaku_Gothic_New({ weight: ["500", "700", "900"], subsets: ["latin"], variable: "--font-lp-display" });
const serif = Shippori_Mincho_B1({ weight: ["600", "800"], subsets: ["latin"], variable: "--font-lp-serif" });
const mono = IBM_Plex_Mono({ weight: ["400", "500"], subsets: ["latin"], variable: "--font-lp-mono" });

export const metadata = {
  title: { absolute: "SFA | メールから始まる、シンプルな営業管理" },
  description: "問い合わせメールを Gmail から自動で取り込み、顧客・案件・売上までひとつの流れで管理。売上 10 億円までの中小企業、営業 5 名までのインバウンド営業に。",
};
export const dynamic = "force-dynamic";

/**
 * 紹介ページ(LP)。未ログインで / を開くと proxy がここへ書き換える(URL は / のまま)。
 * 文言と構成は src/content/lp.ts、料金は運営の料金設定から読む。
 */
export default async function LandingPage() {
  const { data } = await createAdminClient().from("operator_settings").select("key, value");
  const p = pricingFromRows(data as { key: string; value: string }[] | null);
  const ex = LP.pricing.example;
  const exTotal = p.price_base_monthly + Math.max(0, ex.users - 1) * p.price_per_extra_user + Math.max(0, ex.mailAccounts - 1) * p.price_per_extra_mail_account;
  const L = LP.links;

  return (
    <div className={`lp ${display.variable} ${serif.variable} ${mono.variable}`}>
      <header className="top">
        <div className="wrap">
          <Link className="brand" href="#top"><span className="mark">S</span><span>{LP.brand.name} <small>{LP.brand.by}</small></span></Link>
          <nav aria-label="ページ内">
            {LP.nav.map((n) => <a key={n.href} href={n.href}>{n.label}</a>)}
          </nav>
          <div className="cta">
            <Link className="btn ghost" href={L.login}>ログイン</Link>
            <Link className="btn primary" href={L.signup}>無料で始める</Link>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="wrap grid">
            <div>
              <p className="eyebrow">{LP.hero.eyebrow}</p>
              <h1>
                <span className="nw">{LP.hero.line1}</span><br />
                <span className="nw"><span className="u">{LP.hero.line2.underline}</span>{LP.hero.line2.rest}</span>
              </h1>
              <p className="sub">{LP.hero.sub}</p>
              <div className="ctas">
                <Link className="btn primary" href={L.signup}>{p.trial_days} 日間 {LP.hero.cta.label} <small>{LP.hero.cta.note}</small></Link>
                <a className="btn ghost" href={LP.hero.secondary.href}>{LP.hero.secondary.label}</a>
              </div>
              <p className="fine">{LP.hero.fine}</p>
              <div className="tags">{LP.hero.tags.map((t) => <span key={t}>{t}</span>)}</div>
            </div>
            <div className="mock" aria-label="受信メールが案件になるイメージ">
              <div className="inbox">
                <div className="bar"><i></i><i></i><i></i> inbox · 受信トレイ</div>
                {LP.hero.inbox.map((m) => (
                  <div key={m.subject} className={`row${"hot" in m && m.hot ? " hot" : ""}`}>
                    <span className={`dot${"unread" in m && m.unread ? "" : " read"}`}></span>
                    <div>
                      <div className="from">{m.from}</div>
                      <div className="subj">{m.subject}</div>
                      <div className="snip">{m.snippet}</div>
                      {"chip" in m && m.chip && <span className="chip">{m.chip}</span>}
                    </div>
                    <div className="meta">{m.time}<br />{m.category}</div>
                  </div>
                ))}
              </div>
              <span className="arrow">{LP.hero.deal.arrow}</span>
              <div className="deal">
                <div className="k">Deal</div>
                <div className="t">{LP.hero.deal.title}</div>
                <div className="stage"><i></i> {LP.hero.deal.stage}</div>
                <div className="todo">☐ {LP.hero.deal.todo} <b>{LP.hero.deal.due}</b></div>
              </div>
            </div>
          </div>
        </section>

        <section className="who" id="who">
          <div className="wrap">
            <p className="eyebrow">{LP.who.eyebrow}</p>
            <h2>{LP.who.title}</h2>
            <p className="lead" style={{ marginTop: 14 }}>{LP.who.lead}</p>
            <div className="cols">
              {LP.who.cols.map((c, i) => (
                <div className="col" key={c.title}><div className="n">{String(i + 1).padStart(2, "0")}</div><h3>{c.title}</h3><p>{c.body}</p></div>
              ))}
            </div>
          </div>
        </section>

        <section className="flow" id="flow">
          <div className="wrap">
            <p className="eyebrow">{LP.flow.eyebrow}</p>
            <h2>{LP.flow.title}</h2>
            <p className="lead" style={{ marginTop: 14 }}>{LP.flow.lead}</p>
            <div className="rail">
              {LP.flow.steps.map((s, i) => (
                <div className="step" key={s.title}>
                  <div className="num">STEP {i + 1}</div>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                  {"auto" in s && s.auto && <span className="auto">{s.auto}</span>}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="features">
          <div className="wrap">
            <p className="eyebrow">{LP.features.eyebrow}</p>
            <h2>{LP.features.title}</h2>
            <div className="feats">
              {LP.features.items.map((f) => (
                <div className="feat" key={f.title}><span className="ic">{f.icon}</span><h3>{f.title}</h3><p>{f.body}</p></div>
              ))}
            </div>
          </div>
        </section>

        <section className="verdict" id="verdict">
          <div className="wrap grid">
            <div>
              <p className="eyebrow">{LP.verdict.eyebrow}</p>
              <h2>{LP.verdict.title}</h2>
              <p className="story">{LP.verdict.story.map((s, i) => (typeof s === "string" ? <span key={i}>{s}</span> : <b key={i}>{s.b}</b>))}</p>
              <ul>
                {LP.verdict.no.map((t) => <li key={t}>{t}</li>)}
                {LP.verdict.yes.map((t) => <li key={t} className="yes">{t}</li>)}
              </ul>
            </div>
            <div className="stamp">
              <p className="q">{LP.verdict.quote[0]}<br />{LP.verdict.quote[1]}</p>
              <span className="seal">{LP.verdict.seal}</span>
              {LP.verdict.founder ? (
                <div className="founder">
                  <Image src={LP.verdict.founder.src} alt={LP.verdict.founder.name} width={56} height={56} />
                  <div className="name"><b>{LP.verdict.founder.name}</b>{LP.verdict.founder.title}</div>
                </div>
              ) : (
                <p className="by">{LP.verdict.by}</p>
              )}
            </div>
          </div>
        </section>

        <section className="google" id="google">
          <div className="wrap">
            <p className="eyebrow">{LP.google.eyebrow}</p>
            <h2>{LP.google.title}</h2>
            <p className="lead" style={{ marginTop: 14 }}>{LP.google.lead}</p>
            <div className="grid">
              {LP.google.cards.map((c) => (
                <div className="card" key={c.title}><div className="big">{c.big}</div><h3>{c.title}</h3><p>{c.body}</p></div>
              ))}
            </div>
            <p className="note">{LP.google.note}</p>
          </div>
        </section>

        <section className="price" id="pricing">
          <div className="wrap">
            <p className="eyebrow">{LP.pricing.eyebrow}</p>
            <h2>{LP.pricing.title}</h2>
            <p className="lead" style={{ marginTop: 14 }}>{LP.pricing.lead}</p>
            <div className="plan">
              <div className="main">
                <div className="amt"><span className="yen">{yen(p.price_base_monthly)}</span><span className="per">/ 月(税抜)</span></div>
                <p className="tax">税込 {yen(withTax(p.price_base_monthly).gross)}。契約期間は 1 か月で、いつでも解約できます。</p>
                <ul className="inc">{LP.pricing.includes.map((t) => <li key={t}>{t}</li>)}</ul>
                <div className="trial"><span>{p.trial_days} 日間の無料お試し</span><span>お試し中はカード登録不要</span><span>クレジットカード決済</span></div>
              </div>
              <div className="side">
                <h3>必要になったら追加</h3>
                <table>
                  <tbody>
                    <tr><td>ユーザー追加(1 名ごと)</td><td>+{yen(p.price_per_extra_user)} / 月</td></tr>
                    <tr><td>メールアカウント追加(1 件ごと)</td><td>+{yen(p.price_per_extra_mail_account)} / 月</td></tr>
                  </tbody>
                </table>
                <div className="ex">例: {ex.text} → 基本 {yen(p.price_base_monthly)} + ユーザー {yen((ex.users - 1) * p.price_per_extra_user)} + メールアカウント {yen((ex.mailAccounts - 1) * p.price_per_extra_mail_account)} = <b>月額 {yen(exTotal)}(税抜)</b></div>
                <Link className="btn primary" href={L.signup}>無料で始める</Link>
              </div>
            </div>
            <p className="note" style={{ marginTop: 14, fontSize: 13 }}>価格は税抜表示です。最新の料金と詳細は<Link href={L.tokushoho}>特定商取引法に基づく表記</Link>をご確認ください。</p>
          </div>
        </section>

        <section className="faq" id="faq">
          <div className="wrap">
            <p className="eyebrow">{LP.faq.eyebrow}</p>
            <h2>{LP.faq.title}</h2>
            <div className="list">
              {LP.faq.items.map((f) => (
                <details key={f.q}><summary>{f.q}</summary><div className="a">{f.a}</div></details>
              ))}
            </div>
          </div>
        </section>

        <section className="final">
          <div className="wrap">
            <div className="box">
              <div>
                <h2>{LP.final.title}</h2>
                <p>{p.trial_days} 日間、{LP.final.body}</p>
              </div>
              <Link className="btn primary" href={L.signup}>{LP.final.cta}</Link>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <span>© {new Date().getFullYear()} {OPERATOR.name} · 〒{OPERATOR.postalCode} {OPERATOR.address}</span>
          <nav aria-label="法務">
            <Link href={L.terms}>利用規約</Link>
            <Link href={L.privacy}>プライバシーポリシー</Link>
            <Link href={L.tokushoho}>特定商取引法に基づく表記</Link>
            <Link href={L.login}>ログイン</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
