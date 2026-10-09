import { useEffect, useState } from "react";
import { Copy, ExternalLink, FileText, Globe, Hash, Image as ImageIcon, Database, X } from "lucide-react";
import { api, type Evidence } from "../lib/api";
import { useApp } from "../lib/store";
import { cx } from "./ui";

const KIND_ICON: Record<string, typeof FileText> = { pdf_page: FileText, pdf: FileText, api_payload: Globe, dataset: Database, tile: ImageIcon, constant: Hash };
const KIND_LABEL: Record<string, string> = { pdf_page: "Filing page", pdf: "Filing PDF", api_payload: "API payload", dataset: "Dataset", tile: "Imagery tile", constant: "Pinned constant", derived: "Derived" };

export function EvidenceDrawer() {
  const { evidenceIds, openEvidence, evidenceTitle } = useApp();
  const [rows, setRows] = useState<Evidence[] | null>(null);
  const [err, setErr] = useState<string>();
  useEffect(() => {
    if (!evidenceIds) return;
    setRows(null);
    setErr(undefined);
    api.evidence(evidenceIds).then(setRows).catch((e) => setErr(String(e.message)));
  }, [evidenceIds]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && openEvidence(null);
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [openEvidence]);
  if (!evidenceIds) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Evidence drawer">
      <button className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-up" onClick={() => openEvidence(null)} aria-label="Close evidence" />
      <div className="animate-slide-in-right relative flex h-full w-full max-w-lg flex-col border-l border-line bg-surface shadow-panel">
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <div className="text-[11px] font-semibold tracking-[0.16em] text-accent uppercase">Evidence drawer</div>
            <div className="text-sm font-semibold">{evidenceTitle || "Sources"} <span className="font-normal text-muted">· {evidenceIds.length}</span></div>
          </div>
          <button onClick={() => openEvidence(null)} className="focus-ring rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close"><X size={18} /></button>
        </header>
        <div className="stagger min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
          {err && <div className="text-sm text-crit">{err}</div>}
          {!rows && !err && [1, 2, 3].map((i) => <div key={i} className="skeleton h-28 rounded-xl" />)}
          {rows?.map((e) => <EvidenceCard key={e.id} e={e} />)}
          {rows && rows.length === 0 && <div className="text-sm text-muted">No evidence records found for these ids.</div>}
        </div>
      </div>
    </div>
  );
}

function EvidenceCard({ e }: { e: Evidence }) {
  const Icon = KIND_ICON[e.kind] || Globe;
  const [copied, setCopied] = useState(false);
  const cite = `${e.publisher}. ${e.title}. ${e.url}${e.retrieved_at ? ` (retrieved ${e.retrieved_at.slice(0, 10)})` : ""}${e.sha256 ? ` sha256:${e.sha256.slice(0, 16)}` : ""}`;
  const thumb = (e.meta as { thumbnail?: string })?.thumbnail;
  return (
    <article className="rounded-xl border border-line bg-surface-2/50 p-3.5">
      <div className="flex items-start gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent"><Icon size={16} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-semibold tracking-wide text-muted uppercase">{KIND_LABEL[e.kind] || e.kind}{e.page ? ` · page ${e.page}` : ""}</div>
          <h4 className="text-[13px] leading-snug font-semibold">{e.title}</h4>
          <div className="text-[11.5px] text-ink-2">{e.publisher}</div>
        </div>
      </div>
      {e.quote && <blockquote className="mt-2.5 border-l-2 border-accent pl-2.5 font-mono text-[11px] leading-relaxed text-ink-2">“{e.quote}”</blockquote>}
      {thumb && <img src={thumb} alt="Sentinel-2 scene preview" className="mt-2 max-h-40 w-full rounded-lg object-cover" loading="lazy" />}
      <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
        {e.retrieved_at && <><dt className="text-muted">Retrieved</dt><dd className="tnum">{e.retrieved_at.replace("T", " ").slice(0, 19)}</dd></>}
        {e.sha256 && <><dt className="text-muted">SHA-256</dt><dd className="truncate font-mono" title={e.sha256}>{e.sha256}</dd></>}
        {e.license && <><dt className="text-muted">Licence</dt><dd>{e.license}</dd></>}
        {e.local_path && <><dt className="text-muted">Cached</dt><dd className="truncate font-mono">{e.local_path}</dd></>}
        <dt className="text-muted">ID</dt><dd className="font-mono">{e.id}</dd>
      </dl>
      <div className="mt-2.5 flex gap-2">
        <a href={e.url} target="_blank" rel="noreferrer" className={cx("focus-ring inline-flex items-center gap-1 rounded-md border border-line-2 px-2 py-1 text-[11.5px] hover:border-accent hover:text-accent")}>
          <ExternalLink size={12} /> {e.kind === "pdf_page" ? `Open PDF at p.${e.page}` : "Open source"}
        </a>
        <button onClick={() => { navigator.clipboard?.writeText(cite); setCopied(true); setTimeout(() => setCopied(false), 1400); }}
          className="focus-ring inline-flex items-center gap-1 rounded-md border border-line-2 px-2 py-1 text-[11.5px] hover:border-accent hover:text-accent">
          <Copy size={12} /> {copied ? "Copied" : "Copy citation"}
        </button>
      </div>
    </article>
  );
}
