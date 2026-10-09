import hashlib
import json
import unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'apps/web/public'

class SnapshotIntegrityTests(unittest.TestCase):
    def test_published_snapshots_match_their_citations(self):
        data = json.loads((PUBLIC / 'data/snapshot.json').read_text())
        for company in data['companies']:
            for source in company['evidence']:
                raw = (PUBLIC / source['local'].lstrip('/')).read_bytes()
                self.assertEqual(hashlib.sha256(raw).hexdigest(), source['sha256'])
                rows = json.loads(raw)
                self.assertEqual(rows, company['snapshots'][str(source['year'])])
                self.assertEqual(len(rows), source['count'])
                self.assertIn(f"ownerIds={company['ownerId']}", source['url'])
                self.assertEqual(len(rows), len({r['id'] for r in rows}))
                for row in rows:
                    self.assertEqual(row['gas'], 'co2e_100yr')
                    self.assertEqual(row['year'], source['year'])
                    self.assertGreaterEqual(row['emissionsQuantity'], 0)
                    self.assertTrue(-90 <= row['centroid']['latitude'] <= 90)
                    self.assertTrue(-180 <= row['centroid']['longitude'] <= 180)

if __name__ == '__main__':
    unittest.main()
