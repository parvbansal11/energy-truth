"""Refresh public Climate TRACE snapshots; no AWS credentials are used."""
import json
from pathlib import Path
from urllib.request import urlopen
from urllib.parse import urlencode

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw'
RAW.mkdir(parents=True, exist_ok=True)
for name, owner_id in [('ntpc', 'E100000001926'), ('tata', 'E100001010018')]:
    for year in (2023, 2024, 2025):
        query = urlencode(dict(ownerIds=owner_id, year=year, gas='co2e_100yr', limit=500, offset=0))
        with urlopen(f'https://api.climatetrace.org/v7/sources?{query}', timeout=45) as response:
            raw = response.read()
        rows = json.loads(raw)
        if not isinstance(rows, list) or not rows or len(rows) >= 500:
            raise ValueError('Empty or paginated result requires manual investigation.')
        if not all(row['year'] == year and row['gas'] == 'co2e_100yr' for row in rows):
            raise ValueError('Unexpected source year or gas.')
        filename = f'ct-{name}-sources.json' if year == 2024 else f'ct-{name}-{year}.json'
        (RAW / filename).write_bytes(raw)
        print(f'{name} {year}: {len(rows)} records cached')
print('Run python3 scripts/build_demo_snapshot.py to rebuild the browser snapshot.')
