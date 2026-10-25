"""Imports a DXF with FreeCAD's built-in importer and prints what came in as JSON.

Usage: DXF=file.dxf REPORT=out.json freecadcmd freecad-dxf.py
"""
import json
import os

import FreeCAD as App
import Import

doc = App.newDocument("DxfCheck")
Import.readDXF(os.environ["DXF"], doc.Name, True)
doc.recompute()
shapes = []
for obj in doc.Objects:
    shape = getattr(obj, "Shape", None)
    if shape is None or shape.isNull():
        continue
    bb = shape.BoundBox
    shapes.append({"label": obj.Label, "edges": len(shape.Edges), "vertexes": len(shape.Vertexes),
                   "box": [bb.XMin, bb.YMin, bb.XMax, bb.YMax]})
layers = [o.Label for o in doc.Objects if o.Name.startswith("Layer") and o.Name != "LayerContainer"]
with open(os.environ["REPORT"], "w") as f:
    json.dump({"layers": layers, "shapes": shapes}, f, indent=1)
