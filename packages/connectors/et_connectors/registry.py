"""Demo-company registry. IDs were looked up in the GEM Ownership API (CT owner ids are identical, plan §5.3).

BRSR documents are the companies' own filings; `compare_fy` is the fiscal year used for the scorecard and
`boundary` is the disclosure boundary the independent rebuild is compared with."""
from __future__ import annotations

COMPANIES: dict[str, dict] = {
    "NTPC": {
        "symbol": "NTPC",
        "name": "NTPC Ltd",
        "short": "NTPC",
        "entity_id": "E100000001926",
        "cin": "L40101DL1975GOI007966",
        "sector": "Power generation",
        "boundary": "standalone",
        "brsr": [
            {
                "fy": "FY2024-25",
                "url": "https://ntpc.co.in/sites/default/files/announcement/2026/2026-01/07.08.2025_Submission%20of%20BRSR%20Report%20for%20FY%202024-25.pdf",
                "file": "ntpc-fy2025.pdf",
                "layout": "ntpc",
            },
            {
                "fy": "FY2025-26",
                "url": "https://nsearchives.nseindia.com/corporate/NTPC_04082026185539_20260804_STEX_INTIMATIONBRSR_Signed.pdf",
                "file": "ntpc-fy2026.pdf",
                "layout": "ntpc",
            },
        ],
    },
    "TATASTEEL": {
        "symbol": "TATASTEEL",
        "name": "Tata Steel Ltd",
        "short": "Tata Steel",
        "entity_id": "E100001010018",
        "cin": "L27100MH1907PLC000260",
        "sector": "Iron & steel",
        "boundary": "consolidated",
        "brsr": [
            {
                "fy": "FY2024-25",
                "url": "https://www.tatasteel.com/investors/integrated-report-2024-25/pdf/Tata-Steel-IR-2024-25-BRSR-140725.pdf",
                "file": "tatasteel-fy2025.pdf",
                "layout": "tata",
            },
            {
                "fy": "FY2023-24",
                "url": "https://www.tatasteel.com/media/21242/business-responsibility-and-sustainability-report.pdf",
                "file": "tatasteel-fy2024.pdf",
                "layout": "tata",
            },
        ],
    },
    "ULTRACEMCO": {
        "symbol": "ULTRACEMCO",
        "name": "UltraTech Cement Ltd",
        "short": "UltraTech",
        "entity_id": "E100000000531",
        "cin": "L26940MH2000PLC128420",
        "sector": "Cement",
        "boundary": "standalone",
        "brsr": [],
    },
    "JSWSTEEL": {
        "symbol": "JSWSTEEL",
        "name": "JSW Steel Ltd",
        "short": "JSW Steel",
        "entity_id": "E100001000516",
        "cin": "L27102MH1994PLC152925",
        "sector": "Iron & steel",
        "boundary": "standalone",
        "brsr": [],
    },
    "ADANIPOWER": {
        "symbol": "ADANIPOWER",
        "name": "Adani Power Ltd",
        "short": "Adani Power",
        "entity_id": "E100001000558",
        "cin": "L40100GJ1996PLC030533",
        "sector": "Power generation",
        "boundary": "standalone",
        "brsr": [],
    },
}

CT_YEARS = [2023, 2024, 2025]
COMPARE_FY = "FY2024-25"
