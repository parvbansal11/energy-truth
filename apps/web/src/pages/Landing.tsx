import { useEffect, useState } from "react";
import { ArrowRight, Check, KeyRound, Mail, Sparkles, X } from "lucide-react";
import { TerrainHero } from "../components/TerrainHero";
import { Button, cx, VerdictTag, Wordmark } from "../components/ui";
import { api, type CompanySummary } from "../lib/api";
import { cognitoConfigured, cognitoSignIn, demoSession, type Session } from "../lib/auth";
import { mt, signed } from "../lib/format";

const SOURCES = ["Climate TRACE", "Global Energy Monitor", "Grid-India", "Central Electricity Authority", "NASA EOSDIS", "Copernicus", "Company BRSR filings"];
const STEPS = [
  { n: "01", t: "Rebuild", d: "We add up the emissions of every plant a company owns, weighted by ownership, from independent plant data." },
  { n: "02", t: "Compare", d: "We line that up with what the company reported, with honest error bars and a plain verdict." },
  { n: "03", t: "Explain", d: "An agent walks through each step and writes a short note where every number links to its source." },
];

export function Landing({ onSignedIn }: { onSignedIn: (s: Session, tour?: boolean) => void }) {
  const [stats, setStats] = useState<{ companies: number; assets: number; evidence: number; wql: number } | null>(null);
  const [ntpc, setNtpc] = useState<CompanySummary>();
  const [ready, setReady] = useState(false);
  const [signin, setSignin] = useState(false);
  useEffect(() => {
    Promise.all([api.meta(), api.backtest(), api.companies()]).then(([m, b, cs]) => {
      setStats({ companies: m.manifest.companies.length, assets: m.manifest.counts.assets, evidence: m.manifest.counts.evidence, wql: (b.backtest.results.chronos2_covariates as { wql: number }).wql });
      setNtpc(cs.find((c) => c.symbol === "NTPC"));
    }).catch(() => {});
  }, []);
  const demo = () => onSignedIn(demoSession("analyst"), true);
  const scrollTo = (id: string) => (e: React.MouseEvent) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }); };
  return (
    <div className="fixed inset-0 overflow-x-hidden overflow-y-auto bg-bg">
      {/* nav */}
      <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-8 px-5 sm:px-8">
          <Wordmark />
          <nav className="hidden items-center gap-6 text-[13.5px] text-ink-2 md:flex">
            <a href="#how" onClick={scrollTo("how")} className="hover:text-ink">How it works</a>
            <a href="#sources" onClick={scrollTo("sources")} className="hover:text-ink">Data sources</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 px-3" onClick={() => setSignin(true)}>Sign in</Button>
            <Button variant="primary" size="sm" className="h-8 px-3" onClick={demo}>Try the demo</Button>
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="mx-auto grid max-w-[1240px] gap-8 px-5 pt-14 pb-12 sm:px-8 lg:grid-cols-[1.15fr_1fr] lg:items-end lg:pt-24">
        <h1 className="serif text-[46px] leading-[1.02] font-light text-ink sm:text-[64px] lg:text-[76px]">
          {"Check the carbon companies report.".split(" ").map((w, i) => <span key={i} className="word mr-[0.22em]" style={{ animationDelay: `${0.1 + i * 0.07}s` }}>{w}</span>)}
        </h1>
        <div className="animate-fade-up lg:pb-3" style={{ animationDelay: "0.4s" }}>
          <p className="max-w-md text-[17px] leading-relaxed text-ink-2">Energy Truth rebuilds the energy emissions of India's largest companies from independent public data, and shows you the source behind every number.</p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            <Button variant="primary" size="lg" onClick={demo}><Sparkles size={15} /> Start the guided demo</Button>
            <Button variant="outline" size="lg" onClick={() => setSignin(true)}>Sign in</Button>
          </div>
        </div>
      </section>

      {/* framed product window */}
      <section className="mx-auto max-w-[1240px] px-3 sm:px-8">
        <div className="relative h-[520px] overflow-hidden rounded-[28px] border border-line bg-[#e9e4d8] shadow-[0_30px_80px_-40px_rgba(28,27,24,0.45)] sm:h-[600px]">
          <div className={cx("absolute inset-0 transition-opacity duration-[1400ms]", ready ? "opacity-100" : "opacity-0")}><TerrainHero onReady={() => setReady(true)} /></div>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
          {ntpc && (
            <div className="float absolute top-6 left-6 w-[290px] rounded-2xl bg-white/95 p-5 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.45)] backdrop-blur max-sm:right-6 max-sm:w-auto">
              <div className="flex items-start justify-between gap-2">
                <div><div className="text-[12px] text-muted">FY2024-25 · Scope 1</div><div className="serif text-[22px] leading-tight">NTPC</div></div>
                <VerdictTag v={ntpc.verdict} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div><div className="text-[12px] text-muted">Reported</div><div className="tnum text-[22px] font-medium">{mt(ntpc.reported_t)}<span className="text-[13px] text-muted"> Mt</span></div></div>
                <div><div className="text-[12px] text-muted">Rebuilt</div><div className="tnum text-[22px] font-medium text-[var(--s1)]">{mt(ntpc.independent_t)}<span className="text-[13px] text-muted"> Mt</span></div></div>
              </div>
              <div className="mt-3 flex items-center gap-2 text-[12px] text-muted"><span className="tnum rounded-full bg-surface-3 px-2 py-0.5 text-ink-2">z {signed(ntpc.z)}</span> from {ntpc.coverage.ct_linked_assets} plants · BRSR page 17</div>
            </div>
          )}
          <div className="absolute right-6 bottom-6 hidden max-w-[300px] rounded-2xl bg-white/95 p-4 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.45)] backdrop-blur sm:block" style={{ animation: "float 7s ease-in-out infinite 1s" }}>
            <div className="text-[12px] text-muted">Audit agent</div>
            <ul className="mt-2 space-y-1.5 text-[13px]">
              {["Read the BRSR filing", "Sum 41 owned plants", "Check grid and satellites", "Write a cited note"].map((s) => (
                <li key={s} className="flex items-center gap-2"><span className="grid h-4 w-4 place-items-center rounded-full bg-ok-soft text-ok"><Check size={10} strokeWidth={3} /></span>{s}</li>
              ))}
            </ul>
          </div>
          <div className="absolute bottom-6 left-6 hidden rounded-full bg-black/40 px-3 py-1.5 text-[11.5px] text-white backdrop-blur sm:block">Singrauli coalfield, Madhya Pradesh · live 3D terrain</div>
        </div>
      </section>

      {/* sources */}
      <section id="sources" className="mx-auto max-w-[1240px] px-5 pt-20 pb-6 text-center sm:px-8">
        <h2 className="serif text-[30px] font-light">Built only on public evidence</h2>
        <div className="mx-auto mt-8 flex max-w-4xl flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {SOURCES.map((s) => <span key={s} className="serif text-[19px] text-muted">{s}</span>)}
        </div>
      </section>

      {/* how it works */}
      <section id="how" className="mx-auto max-w-[1240px] px-5 pt-16 sm:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="card p-6 shadow-[var(--shadow-sm)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow)]">
              <div className="tnum text-[13px] text-faint">{s.n}</div>
              <div className="serif mt-6 text-[26px]">{s.t}</div>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{s.d}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[[stats?.companies, "Companies audited"], [stats?.assets, "Plants and units mapped"], [stats?.evidence, "Evidence records"], [stats?.wql?.toFixed(3), "Forecast error (WQL)"]].map(([v, l]) => (
            <div key={l as string} className="rounded-2xl bg-surface-3/60 p-5">
              <div className="tnum serif text-[34px] font-light">{v ?? "·"}</div>
              <div className="mt-1 text-[13px] text-muted">{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* closing */}
      <section className="mx-auto max-w-[1240px] px-5 py-20 sm:px-8">
        <div className="flex flex-col items-start justify-between gap-6 rounded-[28px] bg-ink px-8 py-10 text-white md:flex-row md:items-center md:px-12">
          <div>
            <div className="serif text-[34px] leading-tight font-light">See it work in two minutes.</div>
            <p className="mt-2 text-[15px] text-white/70">A short tour shows every part of the product, then you can explore on your own.</p>
          </div>
          <button onClick={demo} className="focus-ring inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-white px-5 text-[14px] font-medium text-ink transition hover:bg-[#f3efe6]">Start the guided demo <ArrowRight size={15} /></button>
        </div>
        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-muted">
          <Wordmark size={15} />
          <span>Terrain: AWS Open Data · Imagery: Esri, Maxar · An independent public-data audit, not an assurance opinion.</span>
        </footer>
      </section>

      {signin && <SignIn onClose={() => setSignin(false)} onSignedIn={onSignedIn} />}
    </div>
  );
}

function SignIn({ onClose, onSignedIn }: { onClose: () => void; onSignedIn: (s: Session, tour?: boolean) => void }) {
  const [role, setRole] = useState<Session["role"]>("analyst");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [onClose]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(undefined);
    setBusy(true);
    try { onSignedIn(await cognitoSignIn(email, pw, role)); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/30 px-4 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label="Sign in">
      <div className="animate-pop w-full max-w-[400px] rounded-3xl bg-surface p-7 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.5)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div><div className="serif text-[28px] leading-tight">Welcome back</div><div className="mt-1 text-[13.5px] text-muted">Sign in to your workspace</div></div>
          <button onClick={onClose} className="focus-ring rounded-full p-1.5 text-muted hover:bg-surface-3" aria-label="Close"><X size={16} /></button>
        </div>
        <div className="mt-5 grid grid-cols-2 rounded-xl bg-surface-3 p-1" role="tablist" aria-label="Role">
          {(["analyst", "lender"] as const).map((r) => (
            <button key={r} role="tab" aria-selected={role === r} onClick={() => setRole(r)}
              className={cx("focus-ring rounded-lg py-1.5 text-[13px] capitalize transition", role === r ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink-2")}>{r}</button>
          ))}
        </div>
        <form onSubmit={submit} className="mt-4 space-y-2.5">
          <label className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 focus-within:border-accent/60 focus-within:ring-4 focus-within:ring-accent/10">
            <Mail size={15} className="text-faint" />
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Work email" autoComplete="username" className="h-11 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint" />
          </label>
          <label className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 focus-within:border-accent/60 focus-within:ring-4 focus-within:ring-accent/10">
            <KeyRound size={15} className="text-faint" />
            <input type="password" required value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" autoComplete="current-password" className="h-11 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint" />
          </label>
          {err && <div className="text-[12.5px] text-crit">{err}</div>}
          <Button variant="primary" size="lg" className="w-full" disabled={busy || !cognitoConfigured}>{busy ? "Signing in…" : "Sign in"}</Button>
          {!cognitoConfigured && <div className="text-center text-[12px] text-muted">Sign-in opens once the Cognito user pool is connected.</div>}
        </form>
        <div className="my-5 flex items-center gap-3 text-[12px] text-faint"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
        <Button variant="outline" size="lg" className="w-full" onClick={() => onSignedIn(demoSession(role), true)}>Continue with demo access <ArrowRight size={14} /></Button>
      </div>
    </div>
  );
}
