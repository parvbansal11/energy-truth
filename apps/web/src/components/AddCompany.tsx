import { useEffect, useRef, useState } from "react";
import { Building2, Check, CircleAlert, FileText, Loader2, Search, X } from "lucide-react";
import { api, type AddJob, type GemHit } from "../lib/api";
import { useApp } from "../lib/store";
import { Button, cx } from "./ui";

const SECTORS = ["Power generation", "Iron & steel", "Cement", "Aluminium", "Oil & gas", "Chemicals", "Other"];

/** Live "add a company": GEM entity search -> optional BRSR PDF -> the EC2 worker runs the pipeline for just that
 *  company (Climate TRACE plants, ownership weights, filing extraction, fusion, Chronos-2) and the map refreshes. */
export function AddCompany({ onClose }: { onClose: () => void }) {
  const { reload, select } = useApp();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<GemHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [pick, setPick] = useState<GemHit | null>(null);
  const [sector, setSector] = useState(SECTORS[0]);
  const [brsr, setBrsr] = useState("");
  const [job, setJob] = useState<AddJob | null>(null);
  const [err, setErr] = useState<string>();
  const logEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2 || pick) return;
    setSearching(true);
    const t = setTimeout(() => api.gemSearch(q.trim()).then(setHits).catch((e) => setErr(String(e.message || e))).finally(() => setSearching(false)), 350);
    return () => clearTimeout(t);
  }, [q, pick]);

  useEffect(() => {
    if (!job || job.status === "done" || job.status === "error") return;
    const t = setInterval(() => api.job(job.job_id).then(setJob).catch(() => {}), 1200);
    return () => clearInterval(t);
  }, [job]);
  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: "nearest" });
    if (job?.status === "done" && job.symbol) reload(job.symbol).catch(() => {});
  }, [job?.log.length, job?.status]);

  const start = async () => {
    if (!pick) return;
    setErr(undefined);
    try {
      setJob(await api.addCompany({ entity_id: pick.entity_id, name: pick.name, sector, brsr_url: brsr.trim() || undefined }));
    } catch (e) {
      setErr(String((e as Error).message || e).replace(/^\d+ /, "").replace(/^\{"detail":"|"\}$/g, ""));
    }
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-ink/35 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label="Add a company" onClick={onClose}>
      <div className="animate-pop w-[520px] max-w-full rounded-2xl bg-surface p-5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="serif text-[22px] leading-snug">Add a company, live</div>
            <p className="mt-1 text-[13px] text-ink-2">We look it up in Global Energy Monitor, pull its plants from Climate TRACE, read its BRSR if you give one, and rebuild its emissions in about a minute.</p>
          </div>
          <button onClick={onClose} className="focus-ring rounded-full p-1 text-faint hover:bg-surface-3 hover:text-ink" aria-label="Close"><X size={15} /></button>
        </div>

        {!job && !pick && (
          <>
            <label className="mt-4 flex items-center gap-2 rounded-xl bg-surface-3/70 px-3 py-2.5 text-[13.5px] focus-within:ring-2 focus-within:ring-accent/30">
              <Search size={14} className="text-faint" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Company name, e.g. Adani Green, Ultratech, Tata Chemicals" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint" />
              {searching && <Loader2 size={14} className="animate-spin text-muted" />}
            </label>
            <ul className="mt-2 max-h-72 overflow-y-auto">
              {hits?.map((h) => (
                <li key={h.entity_id}>
                  <button onClick={() => (h.tracked ? (select(h.tracked), onClose()) : setPick(h))} className="focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface-3/70">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-3 text-muted"><Building2 size={14} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] text-ink">{h.name}</span>
                      <span className="block text-[11.5px] text-muted">{h.country || "Unknown country"} · {h.entity_id}{h.listed ? " · listed" : ""}</span>
                    </span>
                    {h.tracked ? <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[11px] text-ok">Tracked · open</span> : <span className="text-[12px] text-accent">Select</span>}
                  </button>
                </li>
              ))}
              {hits && !hits.length && <li className="px-3 py-5 text-center text-[13px] text-muted">No GEM entity matches “{q}”.</li>}
            </ul>
          </>
        )}

        {!job && pick && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3 rounded-xl bg-surface-3/70 px-3 py-2.5">
              <Building2 size={15} className="text-muted" />
              <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px]">{pick.name}</span><span className="block text-[11.5px] text-muted">GEM {pick.entity_id}</span></span>
              <button onClick={() => setPick(null)} className="text-[12px] text-accent hover:underline">Change</button>
            </div>
            <label className="block text-[12.5px] text-muted">Sector
              <select value={sector} onChange={(e) => setSector(e.target.value)} className="focus-ring mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-2 text-[13.5px] text-ink">
                {SECTORS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label className="block text-[12.5px] text-muted">BRSR PDF link <span className="text-faint">(optional, adds the reported side)</span>
              <span className="mt-1 flex items-center gap-2 rounded-xl border border-line px-3 py-2 focus-within:ring-2 focus-within:ring-accent/30">
                <FileText size={14} className="text-faint" />
                <input value={brsr} onChange={(e) => setBrsr(e.target.value)} placeholder="https://nsearchives.nseindia.com/corporate/…BRSR….pdf" className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-faint" />
              </span>
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setPick(null)}>Back</Button>
              <Button variant="primary" onClick={start}>Rebuild {pick.name.split(" ")[0]}</Button>
            </div>
          </div>
        )}

        {job && (
          <div className="mt-4">
            <div className="flex items-center gap-2 text-[13.5px]">
              {job.status === "done" ? <Check size={15} className="text-ok" /> : job.status === "error" ? <CircleAlert size={15} className="text-crit" /> : <Loader2 size={15} className="animate-spin text-accent" />}
              <span>{job.status === "done" ? `${job.name} is on the map` : job.status === "error" ? "Something went wrong" : `Rebuilding ${job.name}…`}</span>
            </div>
            <div className="mt-3 max-h-56 overflow-y-auto rounded-xl bg-surface-3/70 p-3 font-mono text-[11.5px] leading-relaxed text-ink-2">
              {job.log.map((l, i) => <div key={i} className="animate-fade-up">{l.msg}</div>)}
              {!job.log.length && <div className="text-muted">Starting…</div>}
              <div ref={logEnd} />
            </div>
            {job.warning && <p className="mt-2 rounded-xl bg-sun-soft p-3 text-[12.5px] text-ink-2">{job.warning}</p>}
            {job.error && <p className="mt-2 rounded-xl bg-crit-soft p-3 text-[12.5px] text-crit">{job.error}</p>}
            <div className="mt-3 flex justify-end">
              <Button variant={job.status === "done" ? "primary" : "ghost"} onClick={onClose}>{job.status === "done" ? "Open it" : "Close"}</Button>
            </div>
          </div>
        )}
        {err && <p className={cx("mt-3 rounded-xl bg-crit-soft p-3 text-[12.5px] text-crit")}>{err}</p>}
      </div>
    </div>
  );
}
