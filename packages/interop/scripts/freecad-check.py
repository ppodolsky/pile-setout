"""Opens a .FCStd in FreeCAD, recomputes and solves every sketch, prints a JSON report.

Usage: FCSTD=file.FCStd REPORT=out.json freecadcmd freecad-check.py
(freecadcmd swallows script arguments, hence the environment variables.)
"""
import json
import os

import FreeCAD as App

doc = App.openDocument(os.environ["FCSTD"])
doc.recompute()
report = {"label": doc.Label, "sketches": []}
for obj in doc.Objects:
    if obj.TypeId != "Sketcher::SketchObject":
        continue
    status = obj.solve()
    geometry = []
    for i, g in enumerate(obj.Geometry):
        kind = type(g).__name__
        if kind == "Point":
            geometry.append({"kind": "point", "x": g.X, "y": g.Y, "construction": obj.getConstruction(i)})
        elif kind == "LineSegment":
            geometry.append({"kind": "line", "x1": g.StartPoint.x, "y1": g.StartPoint.y, "x2": g.EndPoint.x, "y2": g.EndPoint.y, "construction": obj.getConstruction(i)})
        else:
            geometry.append({"kind": kind})
    report["sketches"].append({
        "name": obj.Name,
        "solve": status,
        "constraints": [{"type": c.Type, "value": c.Value} for c in obj.Constraints],
        "conflicting": list(getattr(obj, "ConflictingConstraints", []) or []),
        "redundant": list(getattr(obj, "RedundantConstraints", []) or []),
        "malformed": list(getattr(obj, "MalformedConstraints", []) or []),
        "fullyConstrained": getattr(obj, "FullyConstrained", None),
        "valid": obj.isValid(),
        "geometry": geometry,
    })
with open(os.environ["REPORT"], "w") as f:
    json.dump(report, f, indent=1)
