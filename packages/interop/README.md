# @buildkit/interop

CAD import/export for 2D sketches with piles. Framework-free: a neutral `InteropDocument` (points,
segments, `@buildkit/sketch` constraints, pile properties; mm, X right, Y up) and converters:

| Function                                                       | Format                                                |
| -------------------------------------------------------------- | ----------------------------------------------------- |
| `toDXF(doc, opts?)` / `fromDXF(text, opts?)`                   | AutoCAD DXF — writes R12, reads R12 and later (ASCII) |
| `toSLVS(doc)` / `toSLVSBytes(doc)` / `fromSLVS(text \| bytes)` | SolveSpace `.slvs`                                    |
| `toFCStd(doc)`                                                 | FreeCAD `.FCStd` (Sketcher), export only              |
| `toSVG(doc, opts?)`                                            | SVG drawing to scale, export only                     |
| `toPointsCSV(doc, opts?)` / `fromPointsCSV(text, opts?)`       | survey point list (PENZD) for stake-out               |

Every importer returns `{ document, warnings }`; every exporter has an `exportX()` twin returning
`{ output, warnings }`, and `exportWarnings(doc, formatId)` says what a format will drop before the
user saves. `FORMATS` describes the formats for file pickers (extensions, MIME, import/export,
whether constraints survive); `formatOf(fileName)` finds one by extension. Exporters throw
`InteropError` for documents with dangling ids (`checkDocument`).

```ts
import { exportWarnings, fromSLVS, toDXF, toSLVSBytes } from '@buildkit/interop';

const dxf = toDXF(doc); // string
const slvs = toSLVSBytes(doc); // Uint8Array — write as is (see "SolveSpace" below)
exportWarnings(doc, 'dxf'); // ['18 constraint(s) dropped — DXF stores geometry only']
const { document, warnings } = fromSLVS(bytes);
```

## Formats evaluated

| Format                      | Geometry                   | Constraints                         | Piles (head / Ø / depth)                      | Labels         | Who opens it                             | Here            |
| --------------------------- | -------------------------- | ----------------------------------- | --------------------------------------------- | -------------- | ---------------------------------------- | --------------- |
| **DXF R12** (AC1009, ASCII) | points, lines              | —                                   | square POLYLINE / CIRCLE / thickness = −depth | TEXT           | every CAD/GIS/CNC tool, web viewers      | export + import |
| DXF R2000+ (AC1015…)        | + LWPOLYLINE, `$INSUNITS`  | —                                   | as R12                                        | TEXT/MTEXT     | AutoCAD-family, LibreCAD, QGIS…          | import only     |
| **SolveSpace** `.slvs`      | datum points, segments     | **native, all 13 kinds**            | as point comments                             | point comments | SolveSpace (GPL, Win/macOS/Linux/web)    | export + import |
| **FreeCAD** `.FCStd`        | GeomPoint, GeomLineSegment | **native** (ratio ≠ ½ approximated) | —                                             | —              | FreeCAD ≥ 1.0                            | export          |
| **SVG**                     | drawing                    | —                                   | drawn                                         | text           | browsers, Inkscape, printers             | export          |
| Survey CSV (PENZD)          | points                     | —                                   | —                                             | point names    | total stations / GNSS rovers (stake-out) | export + import |
| IFC4 (`IfcPile`)            | 3D solids                  | —                                   | yes, as BIM objects                           | names          | BIM tools                                | not now         |

Recommendation: **DXF R12** for exchanging plans with anyone (architects, surveyors, contractors);
**SolveSpace** when the parametric sketch has to survive a round trip (it is the only open format
whose constraint set covers ours one to one and that we can also read back); **FreeCAD** for users who
continue in FreeCAD; **SVG** for printing; the **point CSV** to load pile positions into a total
station on site.

Not chosen:

- **DXF R2000+ export** — needs handles, owner pointers, BLOCK_RECORDs, CLASSES and an OBJECTS
  dictionary that AutoCAD validates; R12 needs none of that and opens everywhere. The cost: no
  `$INSUNITS` (units are mm by convention, stated in a 999 comment) and no LWPOLYLINE (pile heads are
  the R12 POLYLINE/VERTEX/SEQEND equivalent). Import reads both dialects.
- **FreeCAD import** — needs inflate for the zip (FreeCAD deflates `Document.xml`) and a geometry
  extension parser; out of scope for now.
- **IFC** — overkill for a 2D sketch: STEP physical file, spatial hierarchy (project/site/building),
  placements and swept-solid representations, and no sketch constraints. It is the right target
  later for handing piles to structural/BIM people (`IfcPile` with `IfcPileTypeEnum` BORED/DRIVEN…).
- **STEP/IGES** (3D B-rep, no sketches), **DWG** (closed, needs ODA or LibreDWG), **Onshape/Fusion**
  (proprietary, API-only). **LandXML** (`CgPoints`) is the richer cousin of the point CSV and may be
  worth adding for survey software that prefers it.

## DXF

Export (R12): points as POINT and lines as LINE on `SKETCH`, construction lines on `CONSTRUCTION`
(DASHED, 200/100 mm), piles on `PILES` — head as a closed square POLYLINE, shaft as CIRCLE, both with
thickness = −depth so a 3D viewer shows the pile going down — labels as TEXT on `LABELS` up and right
of the point. `HEADER` sets `$EXTMIN/$EXTMAX`, `$PDMODE 3`/`$PDSIZE` (points drawn as visible
crosses), `TABLES` an `*ACTIVE` VPORT zoomed to the drawing. Non-ASCII text is written as `\U+XXXX`.
Constraints are dropped (DXF has no place for them).

Import: POINT, LINE, LWPOLYLINE, POLYLINE (2D/3D; meshes skipped), CIRCLE, TEXT (alignment point if
justified), MTEXT (formatting stripped). Points within 0.01 mm merge (`tolerance`); polyline edges and
lines become segments (construction when the layer name contains "construct"). On a layer whose name
contains "pile", closed squares and circles up to 5 m (`maxPileSize`) become piles at their centre;
a square and a circle sharing a centre are one pile. Other circles become their centre point. A text
labels the nearest point within 3 text heights (+ 1.5 × pile radius). `$INSUNITS` other than mm is
converted. Arcs (and polyline bulges, read straight), splines, hatches, dimensions and block inserts
are reported, not imported.

## SolveSpace

The export reproduces what SolveSpace itself saves — `solvespace-cli regenerate` rewrites our file
with the same records and fields (verified). One "sketch-in-plane" group on XY:

| `@buildkit/sketch`               | SolveSpace                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------- |
| point                            | datum point request (101)                                                     |
| line                             | line segment (200), ends POINTS_COINCIDENT with the datum points              |
| fix                              | WHERE_DRAGGED (point written at the fix position)                             |
| distance                         | PT_PT_DISTANCE                                                                |
| dx / dy (signed)                 | PROJ_PT_DISTANCE onto the YZ / ZX plane normal (+X / +Y)                      |
| horizontal / vertical            | HORIZONTAL / VERTICAL between the points                                      |
| angle (from X / from a→ref)      | ANGLE line a→b vs the +X normal / vs line a→ref; `other` from line directions |
| ratio ½ / 0 / 1 / other t        | AT_MIDPOINT / POINTS_COINCIDENT / PT_ON_LINE + LENGTH_RATIO(a–p, a–b) = \|t\| |
| onLine                           | PT_ON_LINE (its parameter seeded with the current position)                   |
| coincident                       | POINTS_COINCIDENT between datum points                                        |
| parallel / perpendicular / equal | PARALLEL / PERPENDICULAR / EQUAL_LENGTH_LINES                                 |
| label, pile                      | COMMENT on the point: `P1`, `pile head=400 diameter=300 depth=2000`           |

A line a constraint needs but the document lacks is added as a construction segment in the style
`buildkit-helper`; the importer leaves those out. SolveSpace's ANGLE is unsigned (a direction cosine):
the importer reads the sign from the stored geometry. Import also understands sketches drawn in
SolveSpace: segment ends joined by POINTS_COINCIDENT become one point, HORIZONTAL/VERTICAL on a line,
ANGLE between two segments sharing an end, PROJ_PT_DISTANCE along an axis-parallel segment. Circles,
arcs, curves, text, 3D groups, reference (driven) dimensions, free comments and other constraint types
are reported. Ids are regenerated (`p1…`, `l1…`, `c<handle>`).

The first line of a `.slvs` file is the bytes `B1 B2 B3` + `SolveSpaceREVa`, the rest UTF-8:
`toSLVS` returns text with U+00B1…U+00B3 there, `toSLVSBytes` the bytes to write; `fromSLVS` takes
either (the header may arrive mangled by a UTF-8 decode — it only checks the `SolveSpaceREVa` end).

## FreeCAD

`Document.xml` in a store-only ZIP, one `Sketcher::SketchObject` on XY in the FreeCAD 1.x format:
points are `Part::GeomPoint` (GeoId = point index, vertex 1), lines `Part::GeomLineSegment`
Coincident with their points. fix → DistanceX + DistanceY from the root point (FreeCAD's lock);
distance → Distance; dx/dy → DistanceX/DistanceY (points swapped for negative values); horizontal/
vertical → point-to-point Horizontal/Vertical; angle → Angle of line a→b (radians; to the X axis, or
from line a→ref; reversed lines compensated by 180°); ratio ½ → Symmetric; onLine → PointOnObject;
coincident/parallel/perpendicular/equal → native. Sketcher has no ratio constraint and its
expressions cannot reference a reference constraint of the same sketch, so a ratio ≠ ½ becomes
PointOnObject + a Distance at today's length (reported). Labels and pile sizes are dropped (reported).

## Verified with real software

The sandbox build ran SolveSpace 3.3 `solvespace-cli` (built from source, commit `30e1c3a`) and
FreeCAD 1.1.4 `freecadcmd` (AppImage), plus ezdxf 1.4.2. `src/cad-tools.test.ts` re-runs these checks
when the tools are named in the environment (skipped otherwise):

```bash
SOLVESPACE_CLI=…/solvespace-cli FREECADCMD=…/freecadcmd EZDXF_PYTHON=…/python pnpm vitest run packages/interop
```

- SolveSpace loads the sample (every constraint kind) without errors and re-saves it with identical
  records; with every point nudged by a few mm it solves them back onto the designed positions — so
  each mapping, including signs, the angle `other` flag and the ratio pair, means what we think.
- FreeCAD opens the `.FCStd`: solver status 0, fully constrained, no conflicting/redundant/malformed
  constraints, points in place; the nudged sketch solves back (except the approximated ratio point).
- FreeCAD's DXF importer reads our R12 file: 5 layers, 11 points, 5 lines, 5 squares, 4 circles.
- ezdxf audits our R12 file with no errors or fixes.

Fixtures in `src/__fixtures__/` come from real writers: `solvespace-polyline.slvs` (re-saved by
`solvespace-cli`: joined segments, a circle, reference dimension, comments) and
`ezdxf-r2000-metres.dxf` (`scripts/make-ezdxf-fixture.py`: LWPOLYLINE, MTEXT, `$INSUNITS` = m, arc,
block insert). `scripts/` has the FreeCAD/ezdxf helper scripts the gated tests call.

## Known limitations

- DXF: constraints dropped; arcs/splines/blocks not imported; pile heads must be squares (rotation
  is kept only implicitly — a rotated square still imports as a pile at its centre with its side);
  units in R12 are mm by convention; labels are matched by proximity.
- SolveSpace: sketch-in-plane on XY only (other workplanes are read through stored 3D positions and
  projected); reference dimensions and free comments are not imported; redundant-but-consistent
  constraints (which our solver tolerates) make SolveSpace report "redundant constraints".
- FreeCAD: export only; ratio ≠ ½ not parametric; labels and piles dropped; no `GuiDocument.xml`
  (default colours).
- One label per point: a pile label different from its point's label is lost (reported).
- Not checked in AutoCAD itself (none in the sandbox); R12 is chosen for that reason.

## Sources

- SolveSpace source, https://github.com/solvespace/solvespace (commit 30e1c3a, 2026-10-20):
  `src/file.cpp` (save table, `SaveToFile`/`LoadFromFile`, version string), `src/sketch.h` (group /
  request / entity / constraint type ids, handle encoding `hRequest::entity/param`,
  `hConstraint::param`), `src/request.cpp` (parameter layout of points), `src/constrainteq.cpp`
  (equations of PROJ_PT_DISTANCE, ANGLE, PT_ON_LINE, LENGTH_RATIO, AT_MIDPOINT, WHERE_DRAGGED),
  `src/entity.cpp` (segment vector = p0 − p1), `src/drawconstraint.cpp` (COMMENT on a point),
  `test/constraint/*` (reference files).
- FreeCAD source, https://github.com/FreeCAD/FreeCAD: `src/Mod/Sketcher/App/Constraint.h`
  (ConstraintType ids), `src/Mod/Sketcher/App/GeoEnum.h` (root point / axes GeoIds, PointPos); and a
  `Document.xml` saved by FreeCAD 1.1.4 as the format reference.
- AutoCAD 2012 DXF Reference, https://images.autodesk.com/adsk/files/autocad_2012_pdf_dxf-reference_enu.pdf
  (HEADER `$INSUNITS`/`$PDMODE`/`$EXTMIN`; LAYER, LTYPE, VPORT tables; LINE, POINT, CIRCLE, TEXT
  72/73 alignment, LWPOLYLINE, POLYLINE/VERTEX flags; "Writing a DXF File": optional sections, LTYPE
  before LAYER, EOF).
- ezdxf documentation, DXF file structure (minimum content of R12 vs R13+ files),
  https://ezdxf.readthedocs.io/en/stable/dxfinternals/filestructure.html; ezdxf's R12 output as a
  cross-check of table entries.
- PKWARE APPNOTE.TXT 6.3.10, https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT (local /
  central headers, end of central directory, flag bit 11, CRC-32).
- buildingSMART IFC4 `IfcPile`,
  https://standards.buildingsmart.org/IFC/RELEASE/IFC4/FINAL/HTML/schema/ifcstructuralelementsdomain/lexical/ifcpile.htm
