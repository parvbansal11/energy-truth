import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  BookOpen,
  Building2,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Copy,
  ExternalLink,
  Factory,
  FileCheck2,
  FileText,
  Filter,
  Fingerprint,
  Globe2,
  Layers3,
  ListFilter,
  LoaderCircle,
  MapPin,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import {
  assetColor,
  validateAssets,
  briefText,
  download,
  emptySaved,
  findingsFor,
  fmt,
  fuel,
  mt,
  readSaved,
  sum,
  type Asset,
  type Company,
  type Evidence,
  type Finding,
  type Saved,
  type Snapshot,
} from "./model";
const FacilityMap = lazy(() => import("./FacilityMap"));
type Page = "explore" | "findings" | "evidence" | "brief";
const nav = [
  { id: "explore", name: "Explore facilities", icon: Globe2 },
  { id: "findings", name: "Review findings", icon: ClipboardCheck },
  { id: "evidence", name: "Evidence library", icon: BookOpen },
  { id: "brief", name: "Your brief", icon: FileText },
] as const;
const stepNames = [
  "Resolve the company",
  "Inspect facility records",
  "Check reporting boundaries",
  "Prioritise the evidence",
  "Prepare your findings",
];
const tours = [
  {
    title: "Start with the physical footprint",
    body: "Select a company, then click a facility on the map or in the table. Every point is a real Climate TRACE record.",
  },
  {
    title: "Make the evidence work for you",
    body: "Change the year, search a plant, filter the activity, or switch to satellite context. Open a source to inspect its exact record.",
  },
  {
    title: "Run an evidence review",
    body: "The review checks the cached dataset and produces research priorities and limitations. It does not claim a company is misreporting.",
  },
  {
    title: "Leave with a useful brief",
    body: "Save findings, mark facilities reviewed, add your own notes, and download a cited working brief. Your work is saved in this browser.",
  },
];
function IconLogo() {
  return (
    <span className="logo-symbol">
      <Activity size={22} strokeWidth={2.7} />
    </span>
  );
}
function Modal({
  children,
  onClose,
  className = "",
}: {
  children: React.ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    const el = ref.current;
    el?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && el) {
        const all = Array.from(
          el.querySelectorAll<HTMLElement>(
            'button:not([disabled]),a[href],input,textarea,select,[tabindex="0"]',
          ),
        );
        if (!all.length) {
          e.preventDefault();
          return;
        }
        const first = all[0],
          last = all[all.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === el)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      old?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Review workspace dialog"
        className={`modal ${className}`}
      >
        <button
          className="close-modal icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        {children}
      </div>
    </div>
  );
}
function Trend({
  company,
  selectedYear,
  onYear,
}: {
  company: Company;
  selectedYear: number;
  onYear: (y: number) => void;
}) {
  const rows = [2023, 2024, 2025].map((y) => ({
    year: y,
    total: sum(company.snapshots[y]),
  }));
  const max = Math.max(...rows.map((r) => r.total));
  return (
    <div className="trend-chart">
      {rows.map((r) => (
        <button
          key={r.year}
          onClick={() => onYear(r.year)}
          className={selectedYear === r.year ? "chosen" : ""}
          title={`${r.year}: ${mt(r.total)} Mt CO₂e`}
        >
          <span className="trend-value">{mt(r.total)}</span>
          <span
            className="trend-bar"
            style={{ height: `${35 + (r.total / max) * 54}px` }}
          />
          <span>{r.year}</span>
        </button>
      ))}
    </div>
  );
}
function FindingCard({
  finding,
  saved,
  toggle,
  onEvidence,
  onLocate,
}: {
  finding: Finding;
  saved: boolean;
  toggle: () => void;
  onEvidence: () => void;
  onLocate: () => void;
}) {
  return (
    <article className={`finding-card ${finding.tone}`}>
      <div className="finding-symbol">
        {finding.tone === "teal" ? (
          <ShieldCheck size={20} />
        ) : finding.tone === "blue" ? (
          <Target size={20} />
        ) : (
          <ListFilter size={20} />
        )}
      </div>
      <div className="finding-content">
        <div className="finding-top">
          <span className={`tag ${finding.tone}`}>
            {finding.tone === "teal"
              ? "Source traceability"
              : finding.tone === "blue"
                ? "Research priority"
                : "Needs clarification"}
          </span>
          <button
            className={`save-button ${saved ? "saved" : ""}`}
            onClick={toggle}
            aria-label={`${saved ? "Remove" : "Add"} ${finding.title} ${saved ? "from" : "to"} brief`}
          >
            {saved ? <Check size={15} /> : <Plus size={15} />}{" "}
            {saved ? "In your brief" : "Add to brief"}
          </button>
        </div>
        <h3>{finding.title}</h3>
        <p>{finding.detail}</p>
        <div className="next-action">
          <ArrowRight size={15} />
          {finding.action}
        </div>
        <div className="finding-links">
          <button onClick={onEvidence}>
            View evidence <ArrowUpRight size={13} />
          </button>
          {finding.assetId && (
            <button onClick={onLocate}>
              Locate facility <MapPin size={13} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
export default function App() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [symbol, setSymbol] = useState("NTPC");
  const [year, setYear] = useState(2024);
  const [page, setPage] = useState<Page>("explore");
  const [selected, setSelected] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All activities");
  const [sort, setSort] = useState("emissions");
  const [saved, setSaved] = useState<Saved>(emptySaved);
  const [source, setSource] = useState<Evidence | null>(null);
  const [sourceAsset, setSourceAsset] = useState<Asset | null>(null);
  const [tour, setTour] = useState<number | null>(null);
  const [command, setCommand] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [run, setRun] = useState(-1);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [tableTab, setTableTab] = useState<"facilities" | "breakdown">(
    "facilities",
  );
  const [copyStatus, setCopyStatus] = useState(false);
  const [evidenceQuery, setEvidenceQuery] = useState("");
  const [storageWarning, setStorageWarning] = useState(false);
  const key = `energy-truth:v2:${symbol}:${year}`;
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [page]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/snapshot.json", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw Error("snapshot");
        return r.json();
      })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError")
          setError(
            "The evidence snapshot could not load. Reload to try again.",
          );
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    setSaved(readSaved(key));
  }, [key]);
  const updateSaved = (fn: (s: Saved) => Saved) =>
    setSaved((previous) => {
      const next = fn(previous);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        setStorageWarning(true);
      }
      return next;
    });
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommand((v) => !v);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  useEffect(() => {
    if (run < 0 || run >= stepNames.length) return;
    const t = setTimeout(() => setRun((v) => v + 1), 650);
    return () => clearTimeout(t);
  }, [run]);
  useEffect(() => {
    if (run === stepNames.length) {
      updateSaved((s) => ({ ...s, ran: true }));
      setToast("Evidence review complete. Your findings are ready.");
    }
  }, [run]);
  const company = data?.companies.find((c) => c.symbol === symbol);
  const assets = company?.snapshots[year] || [];
  const visible = useMemo(
    () =>
      assets
        .filter(
          (a) =>
            (filter === "All activities" || fuel(a) === filter) &&
            `${a.name} ${a.id} ${a.country} ${a.assetType}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "name"
            ? a.name.localeCompare(b.name)
            : b.emissionsQuantity - a.emissionsQuantity,
        ),
    [assets, query, filter, sort],
  );
  const findings = useMemo(
    () => (company ? findingsFor(company, year) : []),
    [company, year],
  );
  const active = assets.find((a) => a.id === selected);
  const total = sum(assets);
  const ev = company?.evidence.find((e) => e.year === year);
  const fuels = Array.from(new Set(assets.map(fuel)));
  const running = run >= 0 && run < stepNames.length;
  const switchCompany = (s: string) => {
    setSymbol(s);
    setSaved(readSaved(`energy-truth:v2:${s}:${year}`));
    setSelected(null);
    setFilter("All activities");
    setQuery("");
    setRun(-1);
    setReviewOpen(false);
  };
  const changeYear = (y: number) => {
    setYear(y);
    setSaved(readSaved(`energy-truth:v2:${symbol}:${y}`));
    setRun(-1);
    setReviewOpen(false);
  };
  const toggleFinding = (id: string) =>
    updateSaved((s) => ({
      ...s,
      ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [...s.ids, id],
    }));
  const inspect = (a: Asset | null = null, e: Evidence | undefined = ev) => {
    if (e) {
      setSource(e);
      setSourceAsset(a);
      setCopyStatus(false);
    }
  };
  const startReview = () => {
    try {
      validateAssets(assets, year);
      setRun(0);
      setReviewOpen(true);
    } catch (e) {
      setToast(
        e instanceof Error ? e.message : "The snapshot could not be validated.",
      );
    }
  };
  const exportBrief = () => {
    if (company) {
      download(
        `${symbol}-${year}-review.md`,
        briefText(company, year, findings, saved),
      );
      setToast("Your cited review brief was downloaded.");
    }
  };
  if (error)
    return (
      <div className="loading-screen">
        <IconLogo />
        <h2>Unable to open the workspace</h2>
        <p>{error}</p>
        <button className="primary" onClick={() => location.reload()}>
          Reload workspace
        </button>
      </div>
    );
  if (!data || !company || !ev)
    return (
      <div className="loading-screen">
        <IconLogo />
        <h2>Opening your research workspace</h2>
        <LoaderCircle className="spin" />
      </div>
    );
  const evidenceMatches = company.evidence.filter((e) =>
    `${e.title} ${e.publisher}`
      .toLowerCase()
      .includes(evidenceQuery.toLowerCase()),
  );
  return (
    <div className="app">
      <header className="topbar">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("explore");
          }}
          className="brand"
        >
          <IconLogo />
          <span>
            energy<span className="brand-light">truth</span>
            <small>EMISSIONS INTELLIGENCE</small>
          </span>
        </a>
        <div className="workspace-label">
          <span /> Research workspace <ChevronDown size={13} />
        </div>
        <button className="global-search" onClick={() => setCommand(true)}>
          <Search size={15} /> Search companies & facilities <kbd>⌘ K</kbd>
        </button>
        <div className="topbar-right">
          <span className="snapshot-pill">
            <span className="live-dot" /> Sourced demo
          </span>
          <button
            className="icon-button"
            aria-label="How to use Energy Truth"
            onClick={() => setTour(0)}
          >
            <CircleHelp size={19} />
          </button>
          <span className="avatar" title="Local analyst workspace">
            A
          </span>
        </div>
      </header>
      <aside className="sidebar">
        <div className="side-label">WORKSPACE</div>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              className={page === n.id ? "active" : ""}
              onClick={() => setPage(n.id)}
            >
              <n.icon size={18} />
              {n.name}
              {n.id === "brief" && saved.ids.length > 0 && (
                <span className="nav-count">{saved.ids.length}</span>
              )}
              {n.id === "findings" && saved.ran && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="side-divider" />
        <div className="side-label companies-label">
          COMPANIES <span>{data.companies.length}</span>
        </div>
        <div className="company-list">
          {data.companies.map((c) => (
            <button
              key={c.symbol}
              className={symbol === c.symbol ? "chosen" : ""}
              onClick={() => switchCompany(c.symbol)}
            >
              <span
                className={`company-logo ${c.symbol === "TATASTEEL" ? "tata" : ""}`}
              >
                {c.symbol === "NTPC" ? "N" : "T"}
              </span>
              <span>
                {c.name}
                <small>{c.sector}</small>
              </span>
              {symbol === c.symbol && <span className="company-dot" />}
            </button>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="side-tip">
            <Sparkles size={19} />
            <h4>From claims to clarity.</h4>
            <p>
              Explore the facilities. Inspect the evidence. Build your review.
            </p>
            <button onClick={() => setTour(0)}>
              Take a quick tour <ArrowRight size={13} />
            </button>
          </div>
          <div className="analyst">
            <span className="avatar small">A</span>
            <div>
              Analyst workspace<small>Saved on this device</small>
            </div>
            <ShieldCheck size={16} />
          </div>
        </div>
      </aside>
      <main className="main">
        <div className="breadcrumb">
          Workspace <ChevronRight size={12} /> {company.name}{" "}
          <ChevronRight size={12} />{" "}
          <span>{nav.find((n) => n.id === page)?.name}</span>
        </div>
        <div className="page-heading">
          <div>
            <div className="heading-kicker">
              <span className="tag neutral">{company.sector}</span>
              <span>Owner-linked public evidence</span>
            </div>
            <h1>
              {company.name}{" "}
              <span>
                {page === "explore"
                  ? "under the lens"
                  : page === "findings"
                    ? "review findings"
                    : page === "evidence"
                      ? "evidence library"
                      : "review brief"}
              </span>
            </h1>
            <p>
              {page === "explore"
                ? "Understand the facilities behind the footprint. Find what needs a closer look."
                : page === "findings"
                  ? "Turn source limitations and research priorities into the next useful question."
                  : page === "evidence"
                    ? "Follow every estimate back to the exact source snapshot."
                    : "Collect the findings that matter. Add your perspective. Share the evidence."}
            </p>
          </div>
          <div className="heading-actions">
            <label className="compact-company">
              <span>Company</span>
              <select
                aria-label="Select company"
                value={symbol}
                onChange={(e) => switchCompany(e.target.value)}
              >
                {data.companies.map((c) => (
                  <option key={c.symbol} value={c.symbol}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="year-select">
              <span>Calendar year</span>
              <select
                aria-label="Reporting year"
                value={year}
                onChange={(e) => changeYear(+e.target.value)}
              >
                {[2023, 2024, 2025].map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </label>
            <button
              className="primary"
              onClick={page === "brief" ? exportBrief : startReview}
              disabled={running}
            >
              {running ? (
                <LoaderCircle size={16} className="spin" />
              ) : page === "brief" ? (
                <ArrowDownToLine size={16} />
              ) : (
                <Play size={14} fill="currentColor" />
              )}
              {page === "brief"
                ? "Export brief"
                : saved.ran
                  ? "Run review again"
                  : "Run evidence review"}
            </button>
          </div>
        </div>
        {storageWarning && (
          <div className="notice warning">
            Browser storage is unavailable. Export your brief to retain your
            work.
          </div>
        )}
        {page === "explore" && (
          <>
            <div className="guidance">
              <span className="guidance-icon">
                <Target size={19} />
              </span>
              <div>
                <strong>
                  Your starting question: does the evidence support the claim?
                </strong>
                <p>
                  Explore a facility, run the evidence checks, then save the
                  important findings to your brief.
                </p>
              </div>
              <button onClick={() => setTour(0)}>
                Show me how <ArrowRight size={14} />
              </button>
            </div>
            <section className="metric-grid" aria-label="Snapshot summary">
              <button className="metric" onClick={() => inspect()}>
                <span>
                  Linked facility estimates <CircleHelp size={13} />
                </span>
                <strong>
                  {mt(total)} <small>Mt CO₂e</small>
                </strong>
                <div>
                  <span className="tiny-dot teal" /> {year} · unweighted
                  facility sum <ArrowUpRight size={13} />
                </div>
              </button>
              <button
                className="metric"
                onClick={() => {
                  setQuery("");
                  setFilter("All activities");
                  setTableTab("facilities");
                  document
                    .getElementById("facility-table")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                <span>
                  Facilities in snapshot <Factory size={15} />
                </span>
                <strong>
                  {assets.length} <small>facilities</small>
                </strong>
                <div>
                  Owner-linked records · not complete coverage{" "}
                  <ArrowUpRight size={13} />
                </div>
              </button>
              <button className="metric" onClick={() => setPage("findings")}>
                <span>
                  Disclosure comparison <FileCheck2 size={15} />
                </span>
                <strong className="metric-status">Needs reconciliation</strong>
                <div>
                  <span className="tiny-dot amber" /> Period & ownership
                  boundary unverified <ArrowUpRight size={13} />
                </div>
              </button>
              <button className="metric" onClick={() => setPage("brief")}>
                <span>
                  Your review progress <Bookmark size={15} />
                </span>
                <strong>
                  {saved.reviewed.length}
                  <small> / {assets.length} inspected</small>
                </strong>
                <div>
                  {saved.ids.length} findings saved to your brief{" "}
                  <ArrowUpRight size={13} />
                </div>
              </button>
            </section>
            <div className="explore-grid">
              <section className="map-card">
                <div className="section-heading">
                  <div>
                    <h2>
                      Follow the footprint{" "}
                      <span className="tag neutral">
                        {assets.length} facilities
                      </span>
                    </h2>
                    <p>Select a point to inspect its source and emissions.</p>
                  </div>
                  <Globe2 size={19} />
                </div>
                <div className="map-filter">
                  <div className="input-wrap">
                    <Search size={15} />
                    <input
                      aria-label="Search facilities"
                      placeholder="Find a facility…"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setSelected(null);
                      }}
                    />
                    {query && (
                      <button
                        aria-label="Clear search"
                        onClick={() => setQuery("")}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  <label className="filter-select">
                    <Filter size={13} />
                    <select
                      aria-label="Filter facility activity"
                      value={filter}
                      onChange={(e) => {
                        setFilter(e.target.value);
                        setSelected(null);
                      }}
                    >
                      <option>All activities</option>
                      {fuels.map((f) => (
                        <option key={f}>{f}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <Suspense
                  fallback={
                    <div className="map-loading">
                      <LoaderCircle className="spin" /> Loading map
                    </div>
                  }
                >
                  <FacilityMap
                    assets={visible}
                    selected={selected}
                    onSelect={setSelected}
                    company={symbol}
                  />
                </Suspense>
                <div className="map-caption">
                  <span>
                    <Fingerprint size={12} /> Climate TRACE · calendar {year}
                  </span>
                  <span>Colours show activity, not a reporting verdict.</span>
                </div>
              </section>
              <aside className="insight-panel" id="facility-inspector">
                {active ? (
                  <>
                    <div className="insight-top">
                      <span className="eyebrow">FACILITY INSPECTOR</span>
                      <button
                        className="icon-button"
                        aria-label="Close facility details"
                        onClick={() => setSelected(null)}
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <span
                      className="facility-icon"
                      style={{ color: assetColor(active) }}
                    >
                      <Factory size={25} />
                    </span>
                    <h2>{active.name}</h2>
                    <p className="facility-location">
                      <MapPin size={13} />
                      {active.country} · {fuel(active)}
                      <span className="tag neutral">{year}</span>
                    </p>
                    <div className="facility-emissions">
                      <span>Estimated facility emissions</span>
                      <strong>
                        {mt(active.emissionsQuantity)} <small>Mt CO₂e</small>
                      </strong>
                    </div>
                    <dl className="facility-facts">
                      <div>
                        <dt>Reported capacity</dt>
                        <dd>
                          {active.capacityUnits === "license restricted"
                            ? "Not available"
                            : `${fmt(active.capacity)} ${active.capacityUnits}`}
                        </dd>
                      </div>
                      <div>
                        <dt>Activity</dt>
                        <dd>
                          {active.activityUnits === "license restricted"
                            ? "Not available"
                            : `${fmt(active.activity)} ${active.activityUnits}`}
                        </dd>
                      </div>
                      <div>
                        <dt>Source ID</dt>
                        <dd>CT {active.id}</dd>
                      </div>
                      <div>
                        <dt>Coordinates</dt>
                        <dd>
                          {active.centroid.latitude.toFixed(3)},{" "}
                          {active.centroid.longitude.toFixed(3)}
                        </dd>
                      </div>
                    </dl>
                    <button
                      className="secondary full"
                      onClick={() => inspect(active)}
                    >
                      <BookOpen size={15} /> Inspect source evidence{" "}
                      <ArrowUpRight size={14} />
                    </button>
                    <button
                      className={`reviewed-button ${saved.reviewed.includes(active.id) ? "checked" : ""}`}
                      onClick={() =>
                        updateSaved((s) => ({
                          ...s,
                          reviewed: s.reviewed.includes(active.id)
                            ? s.reviewed.filter((id) => id !== active.id)
                            : [...s.reviewed, active.id],
                        }))
                      }
                    >
                      {saved.reviewed.includes(active.id) ? (
                        <CheckCheck size={16} />
                      ) : (
                        <Check size={16} />
                      )}{" "}
                      {saved.reviewed.includes(active.id)
                        ? "Marked as inspected"
                        : "Mark as inspected"}
                    </button>
                    <p className="micro-note">
                      Facility estimate, not an equity-weighted share. Ownership
                      attribution requires further review.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="insight-top">
                      <span className="eyebrow">THE BIGGER PICTURE</span>
                      <TrendingUp size={17} />
                    </div>
                    <h2>
                      A footprint worth
                      <br />
                      looking into.
                    </h2>
                    <p className="muted">
                      Start with the largest sources, then investigate the
                      boundaries behind the total.
                    </p>
                    <div className="chart-title">
                      <span>Annual facility estimates</span>
                      <small>Mt CO₂e</small>
                    </div>
                    <Trend
                      company={company}
                      selectedYear={year}
                      onYear={changeYear}
                    />
                    <p className="micro-note">
                      Click a year to explore. Inventory membership may change
                      between years.
                    </p>
                    <div className="insight-callout">
                      <span className="tag amber">Before you compare</span>
                      <h4>A facility total is not company Scope 1.</h4>
                      <p>
                        Review ownership shares, missing assets and the
                        disclosure period first.
                      </p>
                      <button onClick={() => setPage("findings")}>
                        See what to check <ArrowRight size={14} />
                      </button>
                    </div>
                  </>
                )}
              </aside>
            </div>
            <section id="facility-table" className="table-card">
              <div className="table-toolbar">
                <div className="tabs">
                  <button
                    className={tableTab === "facilities" ? "active" : ""}
                    onClick={() => setTableTab("facilities")}
                  >
                    <Factory size={15} /> Facility inventory{" "}
                    <span>{visible.length}</span>
                  </button>
                  <button
                    className={tableTab === "breakdown" ? "active" : ""}
                    onClick={() => setTableTab("breakdown")}
                  >
                    <Layers3 size={15} /> Activity breakdown
                  </button>
                </div>
                <label className="sort-label">
                  <ArrowDown size={13} />
                  <select
                    aria-label="Sort facilities"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="emissions">Largest estimate first</option>
                    <option value="name">Facility name A–Z</option>
                  </select>
                </label>
              </div>
              {tableTab === "facilities" ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>FACILITY</th>
                        <th>ACTIVITY</th>
                        <th>ESTIMATE · {year}</th>
                        <th>REVIEW</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((a) => (
                        <tr
                          key={a.id}
                          className={a.id === selected ? "selected" : ""}
                        >
                          <td>
                            <button
                              className="table-facility"
                              onClick={() => {
                                setSelected(a.id);
                                document
                                  .querySelector(".map-card")
                                  ?.scrollIntoView({
                                    behavior: "smooth",
                                    block: "center",
                                  });
                              }}
                            >
                              <span
                                className="table-factory"
                                style={{ color: assetColor(a) }}
                              >
                                <Factory size={15} />
                              </span>
                              <span>
                                {a.name}
                                <small>
                                  {a.country} · CT {a.id}
                                </small>
                              </span>
                            </button>
                          </td>
                          <td>
                            <span className="fuel-chip">
                              <i style={{ background: assetColor(a) }} />
                              {fuel(a)}
                            </span>
                          </td>
                          <td className="numeric">
                            {mt(a.emissionsQuantity)} <small>Mt CO₂e</small>
                          </td>
                          <td>
                            <button
                              className={`review-status ${saved.reviewed.includes(a.id) ? "done" : ""}`}
                              onClick={() =>
                                updateSaved((s) => ({
                                  ...s,
                                  reviewed: s.reviewed.includes(a.id)
                                    ? s.reviewed.filter((x) => x !== a.id)
                                    : [...s.reviewed, a.id],
                                }))
                              }
                            >
                              {saved.reviewed.includes(a.id) ? (
                                <CheckCheck size={13} />
                              ) : (
                                <span className="status-ring" />
                              )}
                              {saved.reviewed.includes(a.id)
                                ? "Inspected"
                                : "To inspect"}
                            </button>
                          </td>
                          <td>
                            <button
                              className="icon-button"
                              aria-label={`View evidence for ${a.name}`}
                              onClick={() => inspect(a)}
                            >
                              <ArrowUpRight size={17} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!visible.length && (
                    <div className="empty-state">
                      <Search size={25} />
                      <h3>No matching facilities</h3>
                      <p>Try another name or clear your filters.</p>
                      <button
                        className="secondary"
                        onClick={() => {
                          setQuery("");
                          setFilter("All activities");
                        }}
                      >
                        Clear filters
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="breakdown">
                  {Array.from(new Set(visible.map(fuel))).map((f) => {
                    const rows = visible.filter((a) => fuel(a) === f);
                    const value = sum(rows);
                    return (
                      <div key={f}>
                        <div>
                          <span>{f}</span>
                          <small>{rows.length} facilities</small>
                          <strong>{mt(value)} Mt CO₂e</strong>
                        </div>
                        <div className="breakdown-track">
                          <span
                            style={{
                              width: `${(value / Math.max(sum(visible), 1)) * 100}%`,
                              background: assetColor(rows[0]),
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <p className="micro-note">
                    Unweighted sums of the currently filtered facility
                    estimates. These are not company-level emissions shares.
                  </p>
                </div>
              )}
            </section>
          </>
        )}
        {page === "findings" && (
          <>
            <div className="review-intro">
              <div className="large-icon">
                <ClipboardCheck size={29} />
              </div>
              <div>
                <span className="eyebrow">
                  {saved.ran ? "REVIEW COMPLETE" : "READY FOR YOUR REVIEW"}
                </span>
                <h2>
                  {saved.ran
                    ? "Evidence checked. Questions made clearer."
                    : "Turn this inventory into a useful review."}
                </h2>
                <p>
                  {saved.ran
                    ? "Your local checks identified the following priorities and limitations. Choose what belongs in your brief."
                    : "Run a local review of the sourced snapshot to check traceability, identify the largest facility, and surface missing comparison inputs."}
                </p>
              </div>
              <button className="primary" onClick={startReview}>
                <Play size={14} />
                {saved.ran ? "Replay checks" : "Start review"}
              </button>
            </div>
            {saved.ran ? (
              <div className="findings-list">
                {findings.map((f) => (
                  <FindingCard
                    key={f.id}
                    finding={f}
                    saved={saved.ids.includes(f.id)}
                    toggle={() => toggleFinding(f.id)}
                    onEvidence={() => inspect()}
                    onLocate={() => {
                      setPage("explore");
                      setSelected(f.assetId || null);
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="check-preview">
                {stepNames.map((name, i) => (
                  <div key={name}>
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    <h3>{name}</h3>
                    <p>
                      {
                        [
                          "Resolve the selected Climate TRACE owner ID.",
                          "Check coordinates, source IDs and the selected year.",
                          "Identify missing disclosure and equity-share inputs.",
                          "Find the largest estimate in this snapshot.",
                          "Prepare cited findings and next questions.",
                        ][i]
                      }
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {page === "evidence" && (
          <>
            <div className="evidence-banner">
              <Fingerprint size={28} />
              <div>
                <h2>Every estimate has a paper trail.</h2>
                <p>
                  Original API responses, source IDs and file fingerprints.
                  Download a snapshot or inspect any facility record.
                </p>
              </div>
              <span className="tag teal">Cached public evidence</span>
            </div>
            <div className="library-search input-wrap">
              <Search size={17} />
              <input
                aria-label="Search evidence"
                placeholder="Search sources or years…"
                value={evidenceQuery}
                onChange={(e) => setEvidenceQuery(e.target.value)}
              />
            </div>
            <div className="evidence-grid">
              {evidenceMatches.map((e) => (
                <button
                  className="evidence-card"
                  key={e.id}
                  onClick={() => inspect(null, e)}
                >
                  <div>
                    <span className="source-mark">CT</span>
                    <span className="tag neutral">API SNAPSHOT</span>
                  </div>
                  <h3>{e.title}</h3>
                  <p>{e.count} facility records · CO₂e, 100-year GWP</p>
                  <div className="evidence-meta">
                    <Fingerprint size={13} /> {e.sha256.slice(0, 18)}…
                  </div>
                  <footer>
                    <span>
                      Retrieved{" "}
                      {new Date(e.retrievedAt).toLocaleDateString("en-GB")}
                    </span>
                    <ArrowUpRight size={16} />
                  </footer>
                </button>
              ))}
            </div>
            {!evidenceMatches.length && (
              <p className="empty-state">No sources match that search.</p>
            )}
            <div className="method-note">
              <ShieldCheck size={21} />
              <div>
                <h3>What this evidence can—and cannot—tell you</h3>
                <p>
                  These are Climate TRACE estimates for facilities returned by
                  its owner filter. Their full emissions are summed without
                  equity weighting. No complete ownership denominator, audited
                  disclosure or calibrated uncertainty interval is loaded.
                  Satellite basemaps provide geographic context only.
                </p>
                <a
                  href="https://climatetrace.org/terms"
                  target="_blank"
                  rel="noreferrer"
                >
                  Climate TRACE data terms <ExternalLink size={13} />
                </a>
              </div>
            </div>
          </>
        )}
        {page === "brief" && (
          <div className="brief-grid">
            <section className="brief-paper">
              <div className="brief-brand">
                <IconLogo /> ENERGY TRUTH <span>ANALYST WORKING BRIEF</span>
              </div>
              <div className="eyebrow">COMPANY EVIDENCE REVIEW</div>
              <h2>{company.name}</h2>
              <p className="brief-subtitle">
                Calendar year {year} · Public facility evidence
              </p>
              <div className="brief-scope">
                <h4>Scope of this review</h4>
                <p>
                  Climate TRACE owner-linked facility inventory. Company-level
                  disclosure comparability and ownership shares remain
                  unverified. This is a research brief, not an assurance
                  opinion.
                </p>
              </div>
              <h3>
                Selected findings <span>{saved.ids.length}</span>
              </h3>
              {findings
                .filter((f) => saved.ids.includes(f.id))
                .map((f) => (
                  <article className="brief-finding" key={f.id}>
                    <button
                      className="icon-button"
                      aria-label={`Remove ${f.title} from brief`}
                      onClick={() => toggleFinding(f.id)}
                    >
                      <X size={14} />
                    </button>
                    <h4>{f.title}</h4>
                    <p>{f.detail}</p>
                    <strong>Next question</strong>
                    <p>{f.action}</p>
                    <button className="text-link" onClick={() => inspect()}>
                      Source: {ev.title} <ArrowUpRight size={12} />
                    </button>
                  </article>
                ))}
              {!saved.ids.length && (
                <div className="brief-empty">
                  <Bookmark size={25} />
                  <h4>Your brief starts with a finding.</h4>
                  <p>
                    Run the evidence review, then choose “Add to brief” on the
                    findings you want to keep.
                  </p>
                  <button
                    className="secondary"
                    onClick={() => setPage("findings")}
                  >
                    Choose findings <ArrowRight size={14} />
                  </button>
                </div>
              )}
              <label className="notes-label" htmlFor="analyst-notes">
                Analyst notes
              </label>
              <textarea
                id="analyst-notes"
                placeholder="What would you ask the company? Add your observations and follow-up questions…"
                value={saved.notes}
                onChange={(e) =>
                  updateSaved((s) => ({ ...s, notes: e.target.value }))
                }
              />
              <div className="print-notes">
                {saved.notes || "No analyst notes added."}
              </div>
              <div className="brief-source">
                <Fingerprint size={15} />
                <div>
                  Source: Climate TRACE · retrieved{" "}
                  {new Date(ev.retrievedAt).toLocaleDateString("en-GB")}
                  <small>{ev.sha256}</small>
                  <a href={ev.url}>{ev.url}</a>
                </div>
              </div>
            </section>
            <aside className="brief-options">
              <h3>Ready to share your thinking?</h3>
              <p>
                Your export includes the selected findings, notes, source links
                and method limitations.
              </p>
              <button className="primary full" onClick={exportBrief}>
                <ArrowDownToLine size={16} /> Download review · Markdown
              </button>
              <button className="secondary full" onClick={() => window.print()}>
                <FileText size={16} /> Print / save as PDF
              </button>
              <div className="save-status">
                <Check size={15} />{" "}
                {storageWarning
                  ? "Export to keep your work"
                  : "Automatically saved on this device"}
              </div>
              <div className="brief-checklist">
                <h4>Before you share</h4>
                <p>
                  <Check size={14} /> Check the source reporting year
                </p>
                <p>
                  <Check size={14} /> Keep the boundary limitations
                </p>
                <p>
                  <Check size={14} /> Add the questions that matter
                </p>
              </div>
              <button className="text-link" onClick={() => setPage("findings")}>
                <ArrowLeft size={14} /> Back to findings
              </button>
            </aside>
          </div>
        )}
        <footer className="main-footer">
          <span>
            <ShieldCheck size={13} /> Built for evidence-led research.
          </span>
          <span>
            Climate TRACE · {year} snapshot{" "}
            <button onClick={() => inspect()}>
              View provenance <ArrowUpRight size={11} />
            </button>
          </span>
        </footer>
      </main>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      {source && (
        <Modal className="evidence-modal" onClose={() => setSource(null)}>
          <div className="eyebrow">EVIDENCE DRAWER</div>
          <div className="source-title">
            <span className="source-mark">CT</span>
            <div>
              <h2>{sourceAsset?.name || source.title}</h2>
              <p>Climate TRACE · calendar {source.year}</p>
            </div>
          </div>
          <div className="notice">
            <ShieldCheck size={18} />
            <span>
              Original cached source. An emissions estimate, not independently
              verified ground truth.
            </span>
          </div>
          {sourceAsset && (
            <dl className="source-facts">
              <div>
                <dt>Emissions estimate</dt>
                <dd>{fmt(sourceAsset.emissionsQuantity)} tCO₂e</dd>
              </div>
              <div>
                <dt>Source ID</dt>
                <dd>{sourceAsset.id}</dd>
              </div>
              <div>
                <dt>Activity type</dt>
                <dd>{fuel(sourceAsset)}</dd>
              </div>
              <div>
                <dt>Gas convention</dt>
                <dd>CO₂e · 100-year GWP</dd>
              </div>
            </dl>
          )}
          <label className="source-field">
            SOURCE REQUEST
            <a
              href={
                sourceAsset
                  ? `https://api.climatetrace.org/v7/sources/${sourceAsset.id}?start=${source.year}&end=${source.year}&gas=co2e_100yr`
                  : source.url
              }
              target="_blank"
              rel="noreferrer"
            >
              {sourceAsset
                ? `api.climatetrace.org/v7/sources/${sourceAsset.id}`
                : source.url}
              <ExternalLink size={15} />
            </a>
          </label>
          <label className="source-field">
            RETRIEVED
            <span>{new Date(source.retrievedAt).toLocaleString("en-GB")}</span>
          </label>
          <label className="source-field">
            SNAPSHOT SHA-256<code>{source.sha256}</code>
          </label>
          <details>
            <summary>
              Inspect {sourceAsset ? "facility record" : "snapshot metadata"}
            </summary>
            <pre>{JSON.stringify(sourceAsset || source, null, 2)}</pre>
          </details>
          <div className="modal-actions">
            <a className="secondary" href={source.local} download>
              <ArrowDownToLine size={15} /> Download raw snapshot
            </a>
            <button
              className="primary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    `${source.publisher}. ${source.title}. ${source.url}. Retrieved ${source.retrievedAt}. SHA-256 ${source.sha256}`,
                  );
                  setCopyStatus(true);
                } catch {
                  setToast(
                    "Clipboard unavailable. Use the source link or download instead.",
                  );
                }
              }}
            >
              {copyStatus ? <Check size={15} /> : <Copy size={15} />}{" "}
              {copyStatus ? "Citation copied" : "Copy citation"}
            </button>
          </div>
          <p className="micro-note">
            Ownership percentages are not provided by this snapshot. Full
            facility values are not automatically attributable to the selected
            company.
          </p>
        </Modal>
      )}
      {reviewOpen && (
        <Modal
          className="review-modal"
          onClose={() => {
            setReviewOpen(false);
            if (running) setRun(-1);
          }}
        >
          <span className="modal-hero-icon">
            <Activity size={27} />
          </span>
          <div className="eyebrow">
            EVIDENCE REVIEW · {company.name.toUpperCase()}
          </div>
          <h2>
            {running
              ? "Following the evidence…"
              : "Your research priorities are ready."}
          </h2>
          <p className="muted">
            Local checks on the cached Climate TRACE snapshot. No live AI audit
            or disclosure verification is being claimed.
          </p>
          <div className="review-steps">
            {stepNames.map((name, i) => (
              <div
                key={name}
                className={`${i < run ? "complete" : ""} ${i === run ? "current" : ""}`}
              >
                <span className="step-circle">
                  {i < run ? (
                    <Check size={16} />
                  ) : i === run ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : (
                    i + 1
                  )}
                </span>
                <div>
                  <h4>{name}</h4>
                  <p>
                    {i <= run
                      ? [
                          `${company.name} · ${company.ownerId}`,
                          `${assets.length} unique facility records · ${year} · CO₂e 100yr`,
                          "Disclosure, complete asset perimeter and equity shares remain open.",
                          `${assets[0].name} has the largest estimate in the snapshot.`,
                          `${findings.length} findings with source references and next actions.`,
                        ][i]
                      : "Waiting for the previous check"}
                  </p>
                </div>
                {i < run && <span className="step-done">Checked</span>}
              </div>
            ))}
          </div>
          <div className="review-progress">
            <span
              style={{ width: `${Math.min(run / stepNames.length, 1) * 100}%` }}
            />
          </div>
          {!running && (
            <button
              className="primary full"
              onClick={() => {
                setReviewOpen(false);
                setPage("findings");
              }}
            >
              Explore review findings <ArrowRight size={16} />
            </button>
          )}
        </Modal>
      )}
      {tour !== null && (
        <Modal className="tour-modal" onClose={() => setTour(null)}>
          <div className="tour-art">
            <Globe2 size={70} />
            <span className="orbit one" />
            <span className="orbit two" />
            <span className="orbit-dot" />
          </div>
          <span className="eyebrow">
            YOUR RESEARCH WORKFLOW · {tour + 1} / {tours.length}
          </span>
          <h2>{tours[tour].title}</h2>
          <p>{tours[tour].body}</p>
          <div className="tour-dots">
            {tours.map((_, i) => (
              <button
                key={i}
                aria-label={`Tour step ${i + 1}`}
                className={tour === i ? "active" : ""}
                onClick={() => setTour(i)}
              />
            ))}
          </div>
          <div className="modal-actions">
            <button className="text-link" onClick={() => setTour(null)}>
              Skip tour
            </button>
            <button
              className="primary"
              onClick={() =>
                tour === tours.length - 1 ? setTour(null) : setTour(tour + 1)
              }
            >
              {tour === tours.length - 1 ? "Explore the company" : "Next"}{" "}
              <ArrowRight size={15} />
            </button>
          </div>
        </Modal>
      )}
      {command && (
        <Modal className="command-modal" onClose={() => setCommand(false)}>
          <div className="command-input">
            <Search size={21} />
            <input
              autoFocus
              aria-label="Search workspace"
              placeholder="Search companies or facilities…"
              value={commandQuery}
              onChange={(e) => setCommandQuery(e.target.value)}
            />
          </div>
          <div className="side-label">COMPANIES</div>
          {data.companies
            .filter((c) =>
              c.name.toLowerCase().includes(commandQuery.toLowerCase()),
            )
            .map((c) => (
              <button
                className="command-result"
                key={c.symbol}
                onClick={() => {
                  switchCompany(c.symbol);
                  setPage("explore");
                  setCommand(false);
                  setCommandQuery("");
                }}
              >
                <Building2 size={19} />
                <div>
                  {c.name}
                  <small>{c.sector}</small>
                </div>
                <ArrowRight size={16} />
              </button>
            ))}
          <div className="side-label">
            FACILITIES · {company.name.toUpperCase()}
          </div>
          {assets
            .filter((a) =>
              a.name.toLowerCase().includes(commandQuery.toLowerCase()),
            )
            .slice(0, 8)
            .map((a) => (
              <button
                className="command-result"
                key={a.id}
                onClick={() => {
                  setPage("explore");
                  setSelected(a.id);
                  setQuery("");
                  setFilter("All activities");
                  setCommand(false);
                  setCommandQuery("");
                }}
              >
                <Factory size={18} />
                <div>
                  {a.name}
                  <small>
                    {fuel(a)} · {mt(a.emissionsQuantity)} Mt CO₂e
                  </small>
                </div>
                <ArrowUpRight size={15} />
              </button>
            ))}
        </Modal>
      )}
    </div>
  );
}
