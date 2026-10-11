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

# ---- added 2026-10-11: GEM ids from the GEM Ownership API (entities?q=), each with Climate TRACE plants in 2024.
# BRSR links only where the PDF was downloaded and its company name + FY2024-25 verified. CINs come from GEM.
COMPANIES.update({
    "TATAPOWER": {"symbol": "TATAPOWER", "name": "Tata Power Company Ltd", "short": "Tata Power", "entity_id": "E100000001940", "cin": None, "sector": "Power generation", "boundary": "standalone", "brsr": [{'fy': 'FY2024-25', 'url': 'https://nsearchives.nseindia.com/corporate/VPTPCL_10062025233557_BRSR.pdf', 'file': 'tatapower-fy2025.pdf'}]},
    "JSWENERGY": {"symbol": "JSWENERGY", "name": "JSW Energy Ltd", "short": "JSW Energy", "entity_id": "E100001000522", "cin": None, "sector": "Power generation", "boundary": "standalone", "brsr": [{'fy': 'FY2024-25', 'url': 'https://nsearchives.nseindia.com/corporate/RITESHJSWEL_19062025002753_BRSR.pdf', 'file': 'jswenergy-fy2025.pdf'}]},
    "NLCINDIA": {"symbol": "NLCINDIA", "name": "NLC India Ltd", "short": "NLC India", "entity_id": "E100001000440", "cin": None, "sector": "Power generation", "boundary": "standalone", "brsr": []},
    "TORNTPOWER": {"symbol": "TORNTPOWER", "name": "Torrent Power Ltd", "short": "Torrent Power", "entity_id": "E100000001941", "cin": None, "sector": "Power generation", "boundary": "standalone", "brsr": []},
    "CESC": {"symbol": "CESC", "name": "CESC Ltd", "short": "CESC", "entity_id": "E100001000736", "cin": None, "sector": "Power generation", "boundary": "standalone", "brsr": []},
    "JINDALSTEL": {"symbol": "JINDALSTEL", "name": "Jindal Steel Ltd", "short": "Jindal Steel", "entity_id": "E100001000439", "cin": None, "sector": "Iron & steel", "boundary": "standalone", "brsr": [{'fy': 'FY2024-25', 'url': 'https://nsearchives.nseindia.com/corporate/JINDALSTEL_08082025175924_BRSR_stx_080825.pdf', 'file': 'jindalstel-fy2025.pdf'}]},
    "SAIL": {"symbol": "SAIL", "name": "Steel Authority of India Ltd", "short": "SAIL", "entity_id": "E100001000703", "cin": None, "sector": "Iron & steel", "boundary": "standalone", "brsr": []},
    "NSLNISP": {"symbol": "NSLNISP", "name": "NMDC Steel Ltd", "short": "NMDC Steel", "entity_id": "E100002004554", "cin": None, "sector": "Iron & steel", "boundary": "standalone", "brsr": []},
    "HINDALCO": {"symbol": "HINDALCO", "name": "Hindalco Industries Ltd", "short": "Hindalco", "entity_id": "E100000120560", "cin": None, "sector": "Aluminium", "boundary": "standalone", "brsr": []},
    "VEDL": {"symbol": "VEDL", "name": "Vedanta Ltd", "short": "Vedanta", "entity_id": "E100001000479", "cin": None, "sector": "Aluminium & metals", "boundary": "standalone", "brsr": []},
    "NATIONALUM": {"symbol": "NATIONALUM", "name": "National Aluminium Co Ltd", "short": "NALCO", "entity_id": "E100000000522", "cin": None, "sector": "Aluminium", "boundary": "standalone", "brsr": []},
    "HINDZINC": {"symbol": "HINDZINC", "name": "Hindustan Zinc Ltd", "short": "Hindustan Zinc", "entity_id": "E100000120561", "cin": None, "sector": "Zinc & metals", "boundary": "standalone", "brsr": []},
    "AMBUJACEM": {"symbol": "AMBUJACEM", "name": "Ambuja Cements Ltd", "short": "Ambuja", "entity_id": "E100001000639", "cin": None, "sector": "Cement", "boundary": "standalone", "brsr": []},
    "ACC": {"symbol": "ACC", "name": "ACC Ltd", "short": "ACC", "entity_id": "E100002004994", "cin": None, "sector": "Cement", "boundary": "standalone", "brsr": [{'fy': 'FY2024-25', 'url': 'https://nsearchives.nseindia.com/corporate/ACC_1_31052025185334_ACC_BRSR_2025.pdf', 'file': 'acc-fy2025.pdf'}]},
    "SHREECEM": {"symbol": "SHREECEM", "name": "Shree Cement Ltd", "short": "Shree Cement", "entity_id": "E100000121281", "cin": None, "sector": "Cement", "boundary": "standalone", "brsr": []},
    "RELIANCE": {"symbol": "RELIANCE", "name": "Reliance Industries Ltd", "short": "Reliance", "entity_id": "E100000121175", "cin": None, "sector": "Oil & gas", "boundary": "standalone", "brsr": [{'fy': 'FY2024-25', 'url': 'https://www.ril.com/reports/BRSR202425.pdf', 'file': 'reliance-fy2025.pdf'}]},
    "IOC": {"symbol": "IOC", "name": "Indian Oil Corporation Ltd", "short": "Indian Oil", "entity_id": "E100000001918", "cin": None, "sector": "Oil & gas", "boundary": "standalone", "brsr": [{'fy': 'FY2024-25', 'url': 'https://iocl.com/uploads/IndianOil_BRSR2425.pdf', 'file': 'ioc-fy2025.pdf'}]},
    "BPCL": {"symbol": "BPCL", "name": "Bharat Petroleum Corporation Ltd", "short": "BPCL", "entity_id": "E100000000509", "cin": None, "sector": "Oil & gas", "boundary": "standalone", "brsr": []},
    "HINDPETRO": {"symbol": "HINDPETRO", "name": "Hindustan Petroleum Corporation Ltd", "short": "HPCL", "entity_id": "E100000001917", "cin": None, "sector": "Oil & gas", "boundary": "standalone", "brsr": []},
    # ONGC removed: its only large emitter (OPaL) is a subsidiary, so the standalone rebuild is ~0.05 Mt and says nothing
    "GAIL": {"symbol": "GAIL", "name": "GAIL (India) Ltd", "short": "GAIL", "entity_id": "E100000000513", "cin": None, "sector": "Oil & gas", "boundary": "standalone", "brsr": []},
})

CT_YEARS = [2023, 2024, 2025]
COMPARE_FY = "FY2024-25"


# ---- companies added live from the UI ("Add a company"): persisted in the curated store, merged at import
def _load_custom() -> None:
    try:
        from et_core.store import store

        for meta in store.read("custom_companies") or []:
            COMPANIES.setdefault(meta["symbol"], meta)
    except Exception:
        pass


def register(meta: dict) -> None:
    from et_core.store import store

    COMPANIES[meta["symbol"]] = meta
    rows = [m for m in (store.read("custom_companies") or []) if m["symbol"] != meta["symbol"]]
    store.write("custom_companies", rows + [meta])


def company_symbols() -> list[str]:
    """Configured demo companies, then any added live."""
    from et_core.config import settings

    _load_custom()
    base = [s for s in settings.demo_companies if s in COMPANIES]
    return base + [s for s in COMPANIES if s not in base and COMPANIES[s].get("custom")]


_load_custom()
