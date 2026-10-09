import { useEffect, useState } from 'react';

type Company = { symbol: string; name: string; readiness: 'not_ingested' };
type Scorecard = { symbol: string; status: 'not_ingested'; estimates: unknown[]; evidence: unknown[]; message: string };
const base = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
async function get<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${base}${path}`, { signal });
  if (!response.ok) throw new Error(`API returned ${response.status}`);
  return response.json() as Promise<T>;
}
export default function App() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [symbol, setSymbol] = useState('');
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    get<{ companies: Company[] }>('/companies', controller.signal).then(data => {
      setCompanies(data.companies); setSymbol(data.companies[0]?.symbol || ''); setError('');
    }).catch(err => { if (err.name !== 'AbortError') setError('Company service unavailable. Start the API and reload.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    setScorecard(null);
    if (!symbol) return;
    const controller = new AbortController();
    get<Scorecard>(`/companies/${encodeURIComponent(symbol)}/scorecard`, controller.signal)
      .then(data => { setScorecard(data); setError(''); })
      .catch(err => { if (err.name !== 'AbortError') setError('Could not load this company. Select it again or reload.'); });
    return () => controller.abort();
  }, [symbol]);
  const company = companies.find(item => item.symbol === symbol);
  return <div className="app">
    <header><a className="brand" href="/">ENERGY<span>TRUTH</span><small>Evidence for the energy economy</small></a><span className="phase">Foundation · P0</span></header>
    <main>
      <div className="intro"><p className="eyebrow">COMPANY INTELLIGENCE</p><h1>Follow the energy.<br/><em>Check the evidence.</em></h1><p className="lede">Compare company disclosures with public plant and grid evidence. Every estimate has a source, a period, and an uncertainty range.</p></div>
      <section className="workspace" aria-label="Company workspace">
        <div className="toolbar"><div><p className="eyebrow">YOUR AUDIT WORKSPACE</p><h2>{company?.name || 'Select a company'}</h2></div><div className="selector"><label htmlFor="company">Company</label><select id="company" value={symbol} disabled={loading || !companies.length} onChange={event => setSymbol(event.target.value)}>{!companies.length && <option value="">{loading ? 'Loading companies…' : 'Service unavailable'}</option>}{companies.map(item => <option key={item.symbol} value={item.symbol}>{item.name}</option>)}</select></div></div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="notice" role="status"><span className="dot"/><div><strong>{scorecard ? 'Evidence ingestion pending' : loading ? 'Connecting to the company service' : 'Preparing the scorecard'}</strong><p>{scorecard?.message || 'The workspace will show estimates once source data is available.'}</p></div></div>
        <div className="metrics">{['Reported Scope 1', 'Independent Scope 1', 'Purchased-power Scope 2'].map(label => <article key={label}><p>{label}</p><strong>Awaiting evidence</strong><small>No verified dataset loaded</small></article>)}</div>
        <div className="lower"><article><p className="eyebrow">PROVENANCE</p><h3>Evidence comes first</h3><p>Disclosure pages, plant ownership, grid-factor versions, and reporting periods will sit beside each estimate.</p><div className="empty">{scorecard?.evidence.length ? 'Evidence available' : 'No evidence records ingested yet'}</div></article><article><p className="eyebrow">AUDIT RUN</p><h3>Trace each step</h3><p>The audit will resolve ownership, read disclosures, rebuild emissions, and explain the result with citations.</p><button disabled title="Requires verified source ingestion and the agent graph">Audit unavailable · data pending</button></article></div>
      </section>
      <p className="footnote">Source integrations planned: Climate TRACE · Global Energy Monitor · Company BRSR filings · CEA · Robbie Andrew · NASA EOSDIS/GIBS · Copernicus</p>
    </main><footer>ENERGY TRUTH <span>Public evidence. Explicit uncertainty.</span></footer>
  </div>;
}
