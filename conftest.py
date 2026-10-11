import os

# tests are deterministic: no live AI calls (the template/rules paths are what the assertions pin)
os.environ["LLM_PROVIDERS"] = "none"
