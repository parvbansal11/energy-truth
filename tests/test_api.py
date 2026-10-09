import json
import unittest
from unittest.mock import patch
from apps.api.handler import handler
from apps.api.service import route


class ReadinessContractTests(unittest.TestCase):
    def test_lambda_gateway_event_returns_health_without_data_readiness(self):
        response = handler({"rawPath": "/health", "requestContext": {"http": {"method": "GET"}}}, None)
        self.assertEqual(response["statusCode"], 200)
        self.assertFalse(json.loads(response["body"])["data_ready"])

    def test_configured_companies_never_expose_unverified_estimates(self):
        with patch.dict("os.environ", {"DEMO_COMPANIES": "NTPC,TATASTEEL"}):
            status, body = route("GET", "/companies")
            self.assertEqual(status, 200)
            self.assertEqual([c["symbol"] for c in body["companies"]], ["NTPC", "TATASTEEL"])
            for company in body["companies"]:
                status, scorecard = route("GET", f'/companies/{company["symbol"]}/scorecard')
                self.assertEqual(status, 200)
                self.assertEqual(scorecard["status"], "not_ingested")
                self.assertEqual(scorecard["estimates"], [])
                self.assertEqual(scorecard["evidence"], [])

    def test_unknown_company_and_mutation_are_rejected(self):
        self.assertEqual(route("GET", "/companies/UNKNOWN/scorecard")[0], 404)
        self.assertEqual(route("POST", "/companies")[0], 405)


if __name__ == "__main__":
    unittest.main()
