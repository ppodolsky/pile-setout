"""Audits a DXF file with ezdxf (https://ezdxf.mozman.at) and prints JSON: version, errors, fixes,
entity counts per (type, layer). Usage: python dxf-audit.py file.dxf
"""
import json
import sys
from collections import Counter

import ezdxf

doc = ezdxf.readfile(sys.argv[1])
auditor = doc.audit()
counts = Counter(f"{e.dxftype()}:{e.dxf.layer}" for e in doc.modelspace())
print(json.dumps({"version": doc.dxfversion, "errors": [e.message for e in auditor.errors],
                  "fixes": [e.message for e in auditor.fixes], "entities": counts}))
