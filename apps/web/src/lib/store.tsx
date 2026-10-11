import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, wsUrl, type Asset, type CompanySummary, type HitlItem, type Meta, type Scorecard } from "./api";

export type AgentEvent = {
  type: "run" | "node" | "tool" | "map" | "hitl" | "interrupt" | "narrative" | "result" | "error";
  node?: string; status?: string; label?: string; summary?: string; tool?: string; input?: unknown; output?: string; image?: string;
  action?: string; asset_ids?: string[]; lon?: number; lat?: number; zoom?: number; fit?: boolean; tone?: string; company?: string;
  text?: string; engine?: string; claims?: { text: string; evidence_id: string }[]; items?: HitlItem[]; value?: { items: HitlItem[]; threshold: number };
  url?: string; run_id?: string; nodes?: string[]; ts?: number; message?: string; report_url?: string; estimates?: Record<string, unknown>; evidence_ids?: string[];
  forecast_mode?: string;
};

export type Layers = {
  no2: boolean; dnb: boolean; grid: boolean; columns: boolean; gemOnly: boolean; plants: boolean; colorBy: "gap" | "fuel";
  imagery: boolean; shade: boolean; terrain: boolean; s2: boolean;
};
export type MapCommand = { id: number; kind: "fly_company" | "fly_to" | "fit_ids"; ids?: string[]; lon?: number; lat?: number; zoom?: number };

type Audit = {
  running: boolean; company?: string; runId?: string; events: AgentEvent[]; nodes: string[]; hitl?: { items: HitlItem[]; threshold: number } | null;
  result?: AgentEvent; error?: string; open: boolean;
};

type Ctx = {
  meta?: Meta; companies: CompanySummary[]; loadError?: string;
  selected: string; select: (s: string) => void;
  scorecard?: Scorecard; scorecards: Record<string, Scorecard>;
  assets: Asset[]; assetsBy: Record<string, Asset[]>;
  plant?: string; openPlant: (id?: string) => void;
  evidenceIds: string[] | null; openEvidence: (ids: string[] | null, title?: string) => void; evidenceTitle?: string;
  layers: Layers; setLayers: (f: (l: Layers) => Layers) => void;
  highlight: string[]; alertIds: string[];
  mapCmd?: MapCommand; command: (c: Omit<MapCommand, "id">) => void;
  audit: Audit; startAudit: (s: string, auto?: boolean) => void; resume: (d: "accept" | "exclude") => void; closeAudit: () => void;
  theme: "dark" | "light"; toggleTheme: () => void;
  panel: "score" | "agent" | "plant"; setPanel: (p: "score" | "agent" | "plant") => void;
  reportUrl?: string; setReportUrl: (u?: string) => void;
  year: string; setYear: (y: string) => void; // Climate TRACE year drawn on the map
  excluded: Set<string>; toggleExclude: (assetId: string) => void; clearExcluded: () => void; // what-if: plants left out of the rebuild
  liveAdd: boolean; reload: (selectSymbol?: string) => Promise<void>;
};

const C = createContext<Ctx | null>(null);
export const useApp = () => {
  const v = useContext(C);
  if (!v) throw new Error("AppProvider missing");
  return v;
};

const initialTheme = (): "dark" | "light" => "dark";

export function AppProvider({ children, initialCompany }: { children: ReactNode; initialCompany?: string }) {
  const [meta, setMeta] = useState<Meta>();
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [loadError, setLoadError] = useState<string>();
  const [selected, setSelected] = useState(initialCompany || "NTPC");
  const [scorecards, setScorecards] = useState<Record<string, Scorecard>>({});
  const [assetsBy, setAssetsBy] = useState<Record<string, Asset[]>>({});
  const [plant, setPlant] = useState<string>();
  const [evidenceIds, setEvidenceIds] = useState<string[] | null>(null);
  const [evidenceTitle, setEvidenceTitle] = useState<string>();
  const [layers, setLayersState] = useState<Layers>({ no2: false, dnb: false, grid: false, columns: false, gemOnly: true, plants: true, colorBy: "gap", imagery: false, shade: true, terrain: true, s2: false });
  const [highlight, setHighlight] = useState<string[]>([]);
  const [alertIds, setAlertIds] = useState<string[]>([]);
  const [mapCmd, setMapCmd] = useState<MapCommand>();
  const [audit, setAudit] = useState<Audit>({ running: false, events: [], nodes: [], open: false });
  const [theme, setTheme] = useState(initialTheme);
  const [panel, setPanel] = useState<"score" | "agent" | "plant">("score");
  const [reportUrl, setReportUrl] = useState<string>();
  const [year, setYear] = useState("2024");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [liveAdd, setLiveAdd] = useState(false);
  const ws = useRef<WebSocket | null>(null);
  const cmdId = useRef(0);


  const load = useCallback(async () => {
    const [m, cs] = await Promise.all([api.meta(), api.companies()]);
    setMeta(m);
    setCompanies(cs);
    const all = await Promise.all(cs.map((c) => Promise.all([api.assets(c.symbol), api.scorecard(c.symbol)])));
    setAssetsBy(Object.fromEntries(cs.map((c, i) => [c.symbol, all[i][0]])));
    setScorecards(Object.fromEntries(cs.map((c, i) => [c.symbol, all[i][1]])));
  }, []);
  useEffect(() => {
    load().catch((e) => setLoadError(String(e.message || e)));
    api.health().then((h) => setLiveAdd(Boolean(h.live_add))).catch(() => {});
  }, [load]);

  const command = useCallback((c: Omit<MapCommand, "id">) => setMapCmd({ ...c, id: ++cmdId.current }), []);
  const select = useCallback((s: string) => {
    setSelected(s);
    setExcluded(new Set());
    setPlant(undefined);
    setHighlight([]);
    setReportUrl(undefined);
    setPanel((p) => (p === "plant" ? "score" : p));
    command({ kind: "fly_company" });
  }, [command]);

  const onEvent = useCallback((ev: AgentEvent) => {
    if (ev.type === "map") {
      if (ev.action === "highlight" && ev.asset_ids) {
        if (ev.tone === "alert") setAlertIds(ev.asset_ids);
        else setHighlight((h) => Array.from(new Set([...h, ...ev.asset_ids!])));
        if (ev.fit) command({ kind: "fit_ids", ids: ev.asset_ids });
      }
      if (ev.action === "fly_to_company") command({ kind: "fly_company" });
      if (ev.action === "fly_to" && ev.lon != null) command({ kind: "fly_to", lon: ev.lon, lat: ev.lat, zoom: ev.zoom });
    }
    setAudit((a) => {
      const next: Audit = { ...a, events: [...a.events, ev] };
      if (ev.type === "run") next.nodes = ev.nodes || [];
      if (ev.run_id) next.runId = ev.run_id;
      if (ev.type === "interrupt") next.hitl = ev.value || null;
      if (ev.type === "result") { next.result = ev; next.running = false; if (ev.report_url) setReportUrl(ev.report_url); }
      if (ev.type === "error") { next.error = ev.message; next.running = false; }
      return next;
    });
  }, [command]);

  const connect = useCallback((first: object) => {
    ws.current?.close();
    const sock = new WebSocket(wsUrl());
    ws.current = sock;
    sock.onopen = () => sock.send(JSON.stringify(first));
    sock.onmessage = (m) => onEvent(JSON.parse(m.data));
    sock.onerror = () => setAudit((a) => ({ ...a, running: false, error: "Agent stream connection failed: is the API running?" }));
  }, [onEvent]);

  const startAudit = useCallback((s: string, auto = false) => {
    setSelected(s);
    setPlant(undefined);
    setHighlight([]);
    setAlertIds([]);
    setAudit({ running: true, company: s, events: [], nodes: [], open: true, hitl: null });
    setPanel("agent");
    setReportUrl(undefined);
    connect({ action: "audit", company: s, auto_approve: auto });
  }, [connect]);

  const resume = useCallback((d: "accept" | "exclude") => {
    // LangGraph re-executes the interrupted node on resume, so its earlier events are replaced by the re-run's.
    setAudit((a) => ({ ...a, hitl: null, events: a.events.filter((e) => e.node !== "Resolver") }));
    const sock = ws.current;
    const msg = JSON.stringify({ action: "resume", run_id: audit.runId, decision: d, company: audit.company });
    if (sock && sock.readyState === WebSocket.OPEN) sock.send(msg);
    else connect(JSON.parse(msg));
  }, [audit.runId, audit.company, connect]);

  const closeAudit = useCallback(() => setAudit((a) => ({ ...a, open: false })), []);
  const openEvidence = useCallback((ids: string[] | null, title?: string) => { setEvidenceIds(ids); setEvidenceTitle(title); }, []);
  const openPlant = useCallback((id?: string) => {
    setPlant(id);
    setPanel((p) => (id ? "plant" : p === "plant" ? "score" : p));
  }, []);
  const setLayers = useCallback((f: (l: Layers) => Layers) => setLayersState(f), []);
  const toggleTheme = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);

  const assets = useMemo(() => Object.values(assetsBy).flat(), [assetsBy]);
  const toggleExclude = useCallback((id: string) => setExcluded((e) => { const n = new Set(e); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  const clearExcluded = useCallback(() => setExcluded(new Set()), []);
  const reload = useCallback(async (sym?: string) => { await load(); if (sym) select(sym); }, [load, select]);
  const value: Ctx = {
    meta, companies, loadError, selected, select, scorecard: scorecards[selected], scorecards, assets, assetsBy, plant, openPlant,
    evidenceIds, openEvidence, evidenceTitle, layers, setLayers, highlight, alertIds, mapCmd, command, audit, startAudit, resume, closeAudit, theme, toggleTheme,
    panel, setPanel, reportUrl, setReportUrl, year, setYear, excluded, toggleExclude, clearExcluded, liveAdd, reload,
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}
