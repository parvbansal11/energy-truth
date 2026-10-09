import { useEffect, useState } from "react";
import { BellRing, RefreshCw } from "lucide-react";
import { api, type Alert } from "../lib/api";
import { go } from "../lib/router";
import { useApp } from "../lib/store";
import { Button, cx, Empty, EvidenceChip, PageShell } from "../components/ui";

const SEV = { high: "bg-crit/12 text-crit ring-crit/30", medium: "bg-warn/12 text-warn ring-warn/30", low: "bg-surface-2 text-muted ring-line-2" };
const TYPE: Record<string, string> = { FORECAST_BAND_BREACH: "Forecast band breach", DISCREPANCY_Z: "Discrepancy |z| > 2", LOW_COVERAGE: "Low coverage", INTENSITY_SPIKE: "Grid intensity spike" };

/** Alerts Inbox (plan §4 item 8). EventBridge runs the same evaluation daily and emails high-severity alerts via SNS. */
export function AlertsPage() {
  const { select } = useApp();
  const [rows, setRows] = useState<Alert[]>();
  const [info, setInfo] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.alerts().then(setRows).catch(() => setRows([])); }, []);
  const run = async () => {
    setBusy(true);
    try {
      const r = await api.runAlerts();
      setRows(r.alerts);
      setInfo(r.sns_configured ? `Re-evaluated · ${r.published} high-severity alert(s) published to SNS` : "Re-evaluated locally · SNS not configured");
    } finally { setBusy(false); }
  };
  return (
    <PageShell title="Alerts Inbox" kicker="|z| > 2 · band breach · low coverage · grid spike"
      actions={<Button variant="outline" onClick={run} disabled={busy}><RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Re-evaluate now</Button>}>
      {info && <div className="rounded-xl bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">{info}</div>}
      {!rows ? <div className="skeleton h-40 rounded-xl" /> : rows.length === 0 ? <Empty>No alerts.</Empty> : (
        <div className="space-y-2">
          {rows.sort((a, b) => (a.severity === "high" ? -1 : 1) - (b.severity === "high" ? -1 : 1)).map((a) => (
            <article key={a.alert_id} className="flex flex-wrap items-start gap-3 rounded-xl border border-line bg-surface p-4">
              <span className={cx("grid h-9 w-9 place-items-center rounded-xl ring-1", SEV[a.severity])}><BellRing size={16} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cx("rounded-lg px-1.5 py-0.5 text-[10.5px] font-semibold ring-1", SEV[a.severity])}>{a.severity}</span>
                  <span className="text-[11px] font-medium text-muted">{TYPE[a.type] || a.type}</span>
                </div>
                <h3 className="mt-1 text-[14px] font-semibold">{a.title}</h3>
                <p className="text-[12.5px] text-ink-2">{a.detail}</p>
                <div className="mt-2 flex items-center gap-2">
                  <EvidenceChip ids={a.evidence_ids} label="evidence" title={a.title} />
                  {a.company !== "GRID" ? <Button variant="ghost" onClick={() => { select(a.company); go("map"); }}>Open on map →</Button> : <Button variant="ghost" onClick={() => go("grid")}>Open grid desk →</Button>}
                </div>
              </div>
              <time className="tnum text-[11px] text-muted">{a.ts.slice(0, 16).replace("T", " ")} UTC</time>
            </article>
          ))}
        </div>
      )}
    </PageShell>
  );
}
