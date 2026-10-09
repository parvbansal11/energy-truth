import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Bot, Compass, X } from "lucide-react";
import { useApp } from "../lib/store";
import { Button, cx, Mark } from "./ui";

type Step = {
  target?: string; // [data-tour="..."]
  title: string;
  body: React.ReactNode;
  place?: "right" | "left" | "bottom" | "top";
  before?: (app: ReturnType<typeof useApp>) => void;
};

const STEPS: Step[] = [
  {
    title: "Welcome to Energy Truth",
    body: <>Big Indian companies publish how much carbon their energy use creates. We rebuild that number from independent public data and show you where the two agree or differ. This tour takes about two minutes.</>,
    before: (a) => { a.openPlant(undefined); a.select("NTPC"); a.setPanel("score"); },
  },
  {
    target: "companies", place: "right", title: "Pick a company",
    body: <>Each row is one company. The <b>grey bar</b> is what the company reported. The <b>blue bar</b> is what we rebuilt from public plant data. We start with NTPC, India's largest power producer.</>,
  },
  {
    target: "map", place: "left", title: "Every circle is a real plant",
    body: <>Bigger circles emit more. The colour shows the company's gap: <b style={{ color: "var(--div-neg)" }}>blue</b> means our rebuild is lower than reported, <b style={{ color: "var(--div-pos)" }}>red</b> means higher. Hollow rings are plants the company owns that have no independent estimate yet. Click any plant to open it.</>,
  },
  {
    target: "layers", place: "right", title: "Add context to the map",
    body: <>Switch on satellite imagery, terrain relief, nitrogen dioxide from space (a sign of burning fuel), night lights, or how clean each region's electricity grid is.</>,
  },
  {
    target: "numbers", place: "left", title: "Reported vs rebuilt",
    body: <>The heart of the product. <b>Reported</b> comes straight from the company's filing. <b>Independent</b> is our rebuild with an error range. The <b>z-score</b> says how big the gap is compared with that uncertainty: under 1 is close, above 2 is a large gap.</>,
    before: (a) => a.setPanel("score"),
  },
  {
    target: "verdict", place: "left", title: "A plain-language verdict",
    body: <><b>Consistent</b>, <b>Watch</b> or <b>Significant gap</b>. If we cannot see enough of a company's plants, we say <b>Inconclusive</b> instead of accusing anyone. Honesty is the point.</>,
  },
  {
    target: "coverage", place: "left", title: "Coverage keeps us honest",
    body: <>How many of the company's own emitting plants we could actually measure. Tata Steel's big Dutch steelworks is missing from the public data, so its gap is marked inconclusive.</>,
  },
  {
    target: "forecast", place: "left", title: "A forecast, with a range",
    body: <>Amazon's Chronos-2 model forecasts monthly emissions using real grid data. When a new filing falls outside the expected range, you get an alert.</>,
  },
  {
    target: "evidence", place: "left", title: "Every number has a source",
    body: <>Click any source button to see exactly where a number came from: the page of the company's PDF, the public data record, or the satellite image, with the date it was fetched.</>,
  },
  {
    target: "stepper", place: "bottom", title: "Your workflow",
    body: <>Five simple steps: pick a <b>company</b>, run the <b>audit</b>, <b>review</b> anything uncertain, look at a <b>plant</b>, and download the <b>report</b>. Click any step to jump to it.</>,
  },
  {
    target: "ask", place: "bottom", title: "Let the agent do the audit",
    body: <>Press <b>Run audit</b> and nine small AI agents work through the checks live: reading the filing, adding up plants, checking the grid and satellites, and writing a short note with sources. If a match is uncertain, it pauses and asks you.</>,
  },
  {
    target: "map", place: "left", title: "Fly into a plant",
    body: <>Here is Vindhyachal, NTPC's largest plant, shown in 3D with satellite imagery. The right panel shows its emissions, ownership and the latest Sentinel-2 image. Use <b>Back to map</b> on the left to return.</>,
    before: (a) => {
      const top = [...(a.assetsBy[a.selected] || [])].filter((x) => x.ct).sort((x, y) => y.ct!.emissions_t["2024"] - x.ct!.emissions_t["2024"])[0];
      if (top) a.openPlant(top.asset_id);
    },
  },
  {
    title: "You're ready",
    body: <>Run the NTPC audit to watch the agents work, or explore on your own. You can replay this tour any time from the <b>Tour</b> button at the top.</>,
    before: (a) => a.openPlant(undefined),
  },
];

const PAD = 8;
const CARD_W = 340;

export function Tour({ onClose }: { onClose: () => void }) {
  const app = useApp();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  const measure = useCallback(() => {
    if (!step.target) return setRect(null);
    const els = [...document.querySelectorAll<HTMLElement>(`[data-tour="${step.target}"]`)].filter((e) => e.offsetParent !== null);
    const el = els[0];
    if (!el) return setRect(null);
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setRect(el.getBoundingClientRect());
  }, [step.target]);

  useEffect(() => { step.before?.(app); }, [i]);
  useLayoutEffect(() => {
    measure();
    const t = setInterval(measure, 350); // follow panels that animate or load in
    addEventListener("resize", measure);
    return () => { clearInterval(t); removeEventListener("resize", measure); };
  }, [measure]);
  const finish = useCallback(() => { try { localStorage.setItem("et-tour-done", "1"); } catch {} onClose(); }, [onClose]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") setI((x) => Math.min(STEPS.length - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [finish]);

  const spot = rect && { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 };
  const card = useMemo(() => {
    const vw = innerWidth, vh = innerHeight;
    if (!spot || vw < 760) return { top: vh / 2, left: vw / 2, center: true };
    let top = spot.top, left = spot.left + spot.width + 18;
    const place = step.place || "right";
    if (place === "left") left = spot.left - CARD_W - 18;
    if (place === "bottom") { top = spot.top + spot.height + 16; left = spot.left + spot.width / 2 - CARD_W / 2; }
    if (place === "top") { top = spot.top - 260; left = spot.left + spot.width / 2 - CARD_W / 2; }
    if (place === "left" && left < 16) left = spot.left + spot.width + 18;
    if (place === "right" && left + CARD_W > vw - 16) left = spot.left - CARD_W - 18;
    // big targets (the map): float the card inside the target instead of beside it
    if (left < 16 || left + CARD_W > vw - 16) left = Math.min(vw - CARD_W - 16, Math.max(16, spot.left + spot.width - CARD_W - 24));
    top = Math.min(vh - 300, Math.max(72, top + (place === "left" || place === "right" ? 0 : 0)));
    return { top, left, center: false };
  }, [spot?.top, spot?.left, spot?.width, spot?.height, step.place]);

  return (
    <div className="fixed inset-0 z-[69]" role="dialog" aria-modal="true" aria-label="Guided tour">
      {spot ? <div className="tour-spot" style={spot} /> : <div className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] transition-opacity" />}
      <div key={i} className={cx("tour-card animate-pop w-[340px] max-w-[calc(100vw-32px)]", card.center && "-translate-x-1/2 -translate-y-1/2")}
        style={{ top: card.top, left: card.left }}>
        <div className="rounded-2xl bg-surface p-5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)]">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">{i === 0 ? <Mark size={18} /> : <Compass size={13} />} {i === 0 ? "Guided tour" : last ? "All set" : `Step ${i} of ${STEPS.length - 2}`}</span>
            <button onClick={finish} className="focus-ring rounded-full p-1 text-faint hover:bg-surface-3 hover:text-ink" aria-label="Close tour"><X size={14} /></button>
          </div>
          <h3 className="serif mt-2 text-[22px] leading-snug">{step.title}</h3>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2 [&_b]:font-medium [&_b]:text-ink">{step.body}</p>
          <div className="mt-4 h-1 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${((i + 1) / STEPS.length) * 100}%` }} /></div>
          <div className="mt-4 flex items-center justify-between gap-2">
            {i > 0 ? <Button variant="ghost" size="sm" onClick={() => setI(i - 1)}><ArrowLeft size={13} /> Back</Button> : <Button variant="ghost" size="sm" onClick={finish}>Skip</Button>}
            {last ? (
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" onClick={finish}>Explore</Button>
                <Button variant="primary" size="sm" onClick={() => { finish(); app.startAudit("NTPC"); }}><Bot size={13} /> Run NTPC audit</Button>
              </div>
            ) : (
              <Button variant="primary" size="sm" onClick={() => setI(i + 1)}>{i === 0 ? "Show me" : "Next"} <ArrowRight size={13} /></Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
