import { useEffect, useState } from "react";
import { ArrowRight, KeyRound, Lock, Mail } from "lucide-react";
import { TerrainHero } from "../components/TerrainHero";
import { Mark } from "../components/ui";
import { api } from "../lib/api";
import { cognitoConfigured, cognitoSignIn, demoSession, type Session } from "../lib/auth";
import { cx } from "../components/ui";

const HEADLINE = "We rebuild every company's energy carbon from public evidence, and only flag a gap when the evidence holds up.";

export function Landing({ onSignedIn }: { onSignedIn: (s: Session) => void }) {
  const [stats, setStats] = useState<{ companies: number; assets: number; evidence: number; wql: number; generated: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    Promise.all([api.meta(), api.backtest()]).then(([m, b]) => setStats({
      companies: m.manifest.companies.length, assets: m.manifest.counts.assets, evidence: m.manifest.counts.evidence,
      wql: (b.backtest.results.chronos2_covariates as { wql: number }).wql, generated: m.manifest.generated_at,
    })).catch(() => {});
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="fixed inset-0 overflow-x-hidden overflow-y-auto bg-bg lg:overflow-hidden">
      <div className={cx("fixed inset-0 isolate z-0 transition-opacity duration-[1600ms]", ready ? "opacity-100" : "opacity-0")}><TerrainHero onReady={() => setReady(true)} /></div>
      <div className="hairline-grid pointer-events-none fixed inset-0 z-0 opacity-[0.35]" />
      <div className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(90deg,rgb(7_9_10/0.92)_0%,rgb(7_9_10/0.55)_38%,transparent_62%)] max-lg:bg-[linear-gradient(180deg,rgb(7_9_10/0.7),rgb(7_9_10/0.85))]" />
      <div className="pointer-events-none fixed inset-x-0 top-0 z-0 h-40 bg-gradient-to-b from-bg to-transparent" />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-0 h-48 bg-gradient-to-t from-bg to-transparent" />

      {/* top bar */}
      <header className="relative z-10 flex items-center justify-between px-6 pt-5 sm:px-10">
        <div className="flex items-center gap-3"><Mark size={30} /><div><div className="text-[13px] font-semibold tracking-[0.32em]">ENERGY TRUTH</div><div className="eyebrow !text-[9px] !tracking-[0.28em] text-faint">Energy-carbon intelligence</div></div></div>
        <div className="eyebrow hidden md:block">Public data · India · FY2024-25</div>
        <div className="flex items-center gap-3">
          <span className="eyebrow hidden items-center gap-2 rounded-[3px] border border-ok/40 bg-ok/10 px-2.5 py-1.5 !text-ok sm:inline-flex"><span className="relative h-1.5 w-1.5 rounded-full bg-ok text-ok ping" />Live · public sources only</span>
          <span className="eyebrow tnum hidden lg:block">{now.toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata" })} IST</span>
        </div>
      </header>

      {/* hero copy */}
      <section className="relative z-10 mt-14 px-6 sm:px-10 lg:absolute lg:top-1/2 lg:left-16 lg:mt-0 lg:max-w-[640px] lg:-translate-y-1/2 lg:px-0">
        <div className="eyebrow inline-flex items-center gap-3 rounded-[3px] border border-line-2 bg-black/40 px-3 py-1.5 !text-ink-2"><span className="h-px w-6 bg-accent" />BRSR verification · Indian energy majors</div>
        <h1 className="mt-6 text-[34px] leading-[1.08] font-light tracking-[-0.02em] text-ink sm:text-[52px] lg:text-[58px]">
          {HEADLINE.split(" ").map((w, i) => <span key={i} className="word mr-[0.25em]" style={{ animationDelay: `${0.15 + i * 0.045}s` }}>{w}</span>)}
        </h1>
        <div className="mt-9 grid max-w-[560px] grid-cols-2 border border-line-2 bg-black/55 backdrop-blur sm:grid-cols-4">
          {[
            [stats?.companies, "Companies"],
            [stats?.assets, "Assets mapped"],
            [stats?.evidence, "Evidence records"],
            [stats?.wql?.toFixed(3), "Chronos-2 WQL"],
          ].map(([v, l], i) => (
            <div key={i} className={cx("px-4 py-3.5", i > 0 && "border-l border-line-2", i === 2 && "max-sm:border-l-0 max-sm:border-t", i === 3 && "max-sm:border-t")}>
              <div className="tnum text-[24px] font-light">{v ?? <span className="skeleton inline-block h-6 w-10 rounded" />}</div>
              <div className="eyebrow mt-1 !text-[9px]">{l}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex max-w-[420px] items-center gap-3 border border-line bg-black/50 px-3 py-2">
          <span className="h-1.5 w-1.5 bg-ok" />
          <span className="text-[11.5px] text-ink-2">Evidence ledger ready</span>
          <span className="eyebrow ml-auto !text-[9px]">{stats ? stats.generated.slice(0, 10) : "loading"}</span>
        </div>
      </section>

      <SignIn onSignedIn={onSignedIn} />

      <footer className="relative z-10 mt-10 mb-6 flex px-6 sm:px-10 lg:absolute lg:bottom-4 lg:left-16 lg:m-0 lg:px-0 flex-wrap items-center gap-x-5 gap-y-1 sm:left-10 lg:left-16">
        <span className="eyebrow !text-faint">Singrauli coalfield · 24.1°N 82.7°E · terrain ×4</span>
        <span className="eyebrow hidden !text-faint md:inline">Terrain AWS Open Data · Imagery Esri, Maxar · Plants Climate TRACE</span>
      </footer>
    </div>
  );
}

function SignIn({ onSignedIn }: { onSignedIn: (s: Session) => void }) {
  const [role, setRole] = useState<Session["role"]>("analyst");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(undefined);
    setBusy(true);
    try { onSignedIn(await cognitoSignIn(email, pw, role)); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  return (
    <aside className="panel animate-slide-in-right relative z-10 mx-6 mt-8 max-w-[340px] sm:mx-10 lg:absolute lg:top-1/2 lg:right-10 lg:mx-0 lg:mt-0 lg:w-[340px] lg:-translate-y-1/2" style={{ animationDelay: "0.4s" }} aria-label="Sign in">
      <div className="border-b border-line px-5 pt-4 pb-3.5">
        <div className="eyebrow flex items-center gap-2"><Lock size={11} /> Secure sign-in</div>
        <div className="mt-2 text-[20px] font-light">Sign in</div>
        <div className="text-[11.5px] text-muted">Authorised analysts only</div>
      </div>
      <div className="px-5 py-4">
        <div className="grid grid-cols-2 border border-line" role="tablist" aria-label="Role">
          {(["analyst", "lender"] as const).map((r) => (
            <button key={r} role="tab" aria-selected={role === r} onClick={() => setRole(r)}
              className={cx("focus-ring eyebrow py-2 transition", role === r ? "bg-surface-3 !text-ink" : "hover:!text-ink-2")}>{r}</button>
          ))}
        </div>
        <form onSubmit={submit} className="mt-4 space-y-2.5">
          <label className="flex items-center gap-2 border border-line bg-black/30 px-3 focus-within:border-accent">
            <Mail size={13} className="text-muted" />
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Work email" autoComplete="username" className="h-10 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint" />
          </label>
          <label className="flex items-center gap-2 border border-line bg-black/30 px-3 focus-within:border-accent">
            <KeyRound size={13} className="text-muted" />
            <input type="password" required value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" autoComplete="current-password" className="h-10 flex-1 bg-transparent text-[13px] outline-none placeholder:text-faint" />
          </label>
          {err && <div className="text-[11.5px] text-crit">{err}</div>}
          <button disabled={busy || !cognitoConfigured} className="focus-ring flex h-10 w-full items-center justify-center gap-1.5 bg-ink text-[13px] font-medium text-bg transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40">
            {busy ? "Signing in…" : "Sign in"} <ArrowRight size={14} />
          </button>
          {!cognitoConfigured && <div className="text-[10.5px] text-faint">Cognito pool not configured on this build.</div>}
        </form>
      </div>
      <div className="flex items-center justify-between border-t border-line px-5 py-3">
        <span className="eyebrow !text-[9px]">Demo access</span>
        <button onClick={() => onSignedIn(demoSession(role))} className="focus-ring inline-flex items-center gap-1 border border-line-2 px-2.5 py-1.5 text-[12px] text-ink transition hover:border-accent hover:text-accent">
          Continue as {role} <ArrowRight size={12} />
        </button>
      </div>
    </aside>
  );
}
