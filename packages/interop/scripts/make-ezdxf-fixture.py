"""Writes src/__fixtures__/ezdxf-r2000-metres.dxf: a third-party DXF R2000 file (by ezdxf) in metres
with the entity kinds the importer handles or must report. Usage: python make-ezdxf-fixture.py OUT.dxf
"""
import sys

import ezdxf

doc = ezdxf.new("R2000")
doc.units = ezdxf.units.M
doc.header["$INSUNITS"] = 6
msp = doc.modelspace()
for name in ("Piles", "Outline", "Construction", "Notes"):
    doc.layers.add(name)

# a pile: square head 0.4 m + shaft 0.3 m, 2 m deep (negative thickness), labelled by MTEXT
msp.add_lwpolyline([(0.8, 0.8), (1.2, 0.8), (1.2, 1.2), (0.8, 1.2)], close=True, dxfattribs={"layer": "Piles", "thickness": -2.0})
msp.add_circle((1, 1), 0.15, dxfattribs={"layer": "Piles", "thickness": -2.0})
msp.add_mtext("{\\fArial|b1;P\\U+00F6-1}", dxfattribs={"layer": "Notes", "insert": (1.3, 1.3), "char_height": 0.1})
# outline: closed rectangle, corners shared with a construction diagonal
msp.add_lwpolyline([(0, 0), (6, 0), (6, 2.4), (0, 2.4)], close=True, dxfattribs={"layer": "Outline"})
msp.add_line((0, 0), (6, 2.4), dxfattribs={"layer": "Construction"})
msp.add_text("Corner", dxfattribs={"layer": "Notes", "insert": (6.05, 2.45), "height": 0.1})
msp.add_point((3, 0), dxfattribs={"layer": "Outline"})
# reported, not imported
msp.add_lwpolyline([(0, -1, 0, 0, 0.5), (2, -1)], dxfattribs={"layer": "Outline"})  # one bulge (arc) segment
msp.add_circle((4, 1), 0.5, dxfattribs={"layer": "Outline"})
msp.add_arc((5, 1), 0.3, 0, 90, dxfattribs={"layer": "Outline"})
block = doc.blocks.new("MARK")
block.add_line((0, 0), (0.1, 0.1))
msp.add_blockref("MARK", (2, 2))
doc.saveas(sys.argv[1])
