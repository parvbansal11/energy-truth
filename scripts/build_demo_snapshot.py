"""Build the browser snapshot from cached, unmodified Climate TRACE API responses."""
import hashlib,json,datetime
from pathlib import Path
root=Path(__file__).resolve().parents[1]
out=root/'apps/web/public/data';out.mkdir(parents=True,exist_ok=True)
companies=[]
for symbol,key,owner,name,sector in [('NTPC','ntpc','E100000001926','NTPC','Power generation'),('TATASTEEL','tata','E100001010018','Tata Steel','Steel & manufacturing')]:
 snapshots={};evidence=[]
 for year in [2023,2024,2025]:
  path=root/'data/raw'/f'ct-{key}-{year}.json'
  if year==2024:path=root/'data/raw'/f'ct-{key}-sources.json'
  raw=path.read_bytes();rows=json.loads(raw)
  assert isinstance(rows,list) and len(rows)<500, 'Pagination must be resolved before publishing'
  assert len({r['id'] for r in rows})==len(rows)
  assert all(r['year']==year and r['gas']=='co2e_100yr' for r in rows)
  url=f'https://api.climatetrace.org/v7/sources?ownerIds={owner}&year={year}&gas=co2e_100yr&limit=500&offset=0'
  dest=f'{symbol.lower()}-{year}.json';(out/dest).write_bytes(raw)
  evidence.append({'id':f'{symbol}-{year}','title':f'{name} · {year} facility inventory','publisher':'Climate TRACE','url':url,'local':f'/data/{dest}','sha256':hashlib.sha256(raw).hexdigest(),'year':year,'count':len(rows),'retrievedAt':datetime.datetime.fromtimestamp(path.stat().st_mtime,datetime.timezone.utc).isoformat()})
  snapshots[str(year)]=rows
 companies.append({'symbol':symbol,'name':name,'ownerId':owner,'sector':sector,'snapshots':snapshots,'evidence':evidence})
(out/'snapshot.json').write_text(json.dumps({'companies':companies,'methodology':'Owner-filtered facility inventories. Sums are full-facility estimates, not ownership-weighted company Scope 1. Annual calendar years. Corporate completeness and disclosure comparability are unverified.'},separators=(',',':')))
world=root/'data/raw/countries.geojson'
if world.exists():
 geo=json.loads(world.read_text());
 for f in geo['features']: f['properties']={'name':f['properties']['NAME']}
 (out/'countries.geojson').write_text(json.dumps(geo,separators=(',',':')))
print([(c['name'],len(c['snapshots']['2024'])) for c in companies])
