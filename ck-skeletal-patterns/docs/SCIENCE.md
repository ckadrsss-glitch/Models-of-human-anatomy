# Morphology model, cephalometric graphics and quality control

## Concept

The film combines two **independent** characteristics into an illustrative 3 × 3 matrix:

* sagittal skeletal relationship — Class I, Class II, Class III;
* vertical pattern — hypodivergent, normodivergent, hyperdivergent.

The nine cells are combinations, not nine separate diagnoses. No numeric values (ANB, FMA,
SN–GoGn, …) or thresholds appear on screen; the footnote reads *"Schematic representation of
skeletal relationships"*.

## What stays identical in all nine skulls

Cranial vault and base, orbits, nasal bones, zygomatic arches, glenoid fossae and the **condyles in
the fossae**, S and N. All nine skulls use the same geometry, scale, lighting, orientation and an
orthographic, strictly lateral camera (no perspective differences between cells).

## Sagittal (`s`: +1 Class II · 0 Class I · −1 Class III)

Implemented as morphology of both jaws — never as a rigid shift of the whole mandible:

| | Mandible | Maxilla |
|---|---|---|
| Class II | **body shorter** by 5 mm between ramus and dentition (ramus and condyle unchanged) | basal/alveolar complex below the orbits 2 mm more anterior |
| Class III | **body longer** by 4.5 mm | basal/alveolar complex 2.5 mm more posterior (mid-face deficiency) |

The change in mandibular length is applied along the functional occlusal plane in the region between
the ramus and the second molar, so the dentition moves as an intact arch and the cusps
re-interdigitate (relative shift ≈ one premolar width). The maxillary field fades out towards the
orbits and the pterygoid plates, so there are no gaps at the sutures.
During a sagittal morph the mandible opens by ~1–2° about the condyle exactly while the incisors (or
cusps) pass each other, then closes again — static states are always in occlusion.

The source skull has an end-on (slightly distal) molar relationship, so Class I is calibrated with a
1.5 mm longer mandibular body.

## Vertical (`v`: −1 hypo · 0 normo · +1 hyper)

| Component | Hyperdivergent (hypodivergent = opposite) |
|---|---|
| Gonial angle | body bends about gonion → more obtuse angle |
| Ramus height | shorter ramus (gonion higher) |
| Mandibular rotation about the condyle | clockwise (chin down and back) |
| Antegonial notch | deepened (hyper only) |
| Symphysis | longer and narrower; in hypo shorter with a more prominent chin |
| Maxillary dento-alveolar height | follows the lower dentition (taller in hyper, shorter in hypo) |
| Sagittal compensation | mandibular body/dentition slightly adjusted so that the A–N–B relationship of the column does not drift with the vertical pattern |

The upper dentition follows exactly the same rigid transform as the lower dentate segment, so
**overbite is essentially unchanged** across the vertical patterns — open bite / deep bite are not
presented as mandatory features of a vertical pattern. Tooth crowns are rigid; roots deform with the
alveolar bone so they never perforate the cortical plates.

## Numerical check (documentation only — never shown in the film)

Measured on the warped landmarks (`node -e "import('./src/morph.js')…"`, see `landmarks()`, `anb()`):

| Cell | ANB (°) | SN–GoMe (°) | overjet (mm) | overbite (mm) | lower face height ANS–Me (mm) |
|---|---|---|---|---|---|
| I · hypo | 3.8 | 22.9 | 1.9 | 0.6 | 50.2 |
| I · normo | 4.0 | 29.0 | 1.8 | 0.8 | 55.5 |
| I · hyper | 4.0 | 35.2 | 1.7 | 1.0 | 61.3 |
| II · hypo | 9.1 | 23.8 | 8.9 | 0.9 | 49.8 |
| II · normo | 8.9 | 29.9 | 8.7 | 1.8 | 54.5 |
| II · hyper | 8.5 | 36.1 | 8.5 | 2.7 | 59.8 |
| III · hypo | −1.6 | 22.2 | −5.1 | 0.5 | 50.6 |
| III · normo | −1.1 | 28.3 | −5.1 | −0.1 | 56.4 |
| III · hyper | −0.7 | 34.5 | −5.1 | −0.6 | 62.7 |

Columns keep their sagittal relationship (ANB spread ≤ 0.6° within a column); rows keep their vertical
pattern (SN–GoMe spread ≤ 1.6° within a row). Landmarks were placed on the source skull from
mid-sagittal profiles (`tools/landmarks.py`); they are approximate (±1–2 mm), which is adequate for a
schematic film but not for clinical measurement. The source skull is mildly convex, hence Class I ANB
near the upper end of the usual range.

## Cephalometric graphics

One analysis family only (Steiner-type reference lines), minimal:

* **S–N** (anterior cranial base) — dashed white, in scenes 2–4;
* **N–A** and **N–B** with A and B points — scene 2 (sagittal);
* **Go–Me** mandibular plane, extended posteriorly to show its convergence with S–N — scene 3 and in
  every matrix cell;
* an unlabelled bracket for lower anterior face height (ANS level → menton) — scene 3.

No angle values, no arcs with degrees, no mixing with Sassouni / Frankfort planes.

## Quality control

| Question | Result |
|---|---|
| Are the three sagittal classes distinguishable? | Yes — overjet/reverse overjet, chin position and the N–A / N–B lines change clearly. |
| Are the three vertical patterns distinguishable? | Yes — mandibular-plane inclination relative to S–N, gonial angle and lower face height. |
| Are all nine combinations represented correctly? | Yes — see the table: each cell combines its column's sagittal and its row's vertical values. |
| Same scale for all skulls? | Yes — one orthographic camera, identical geometry and scale. |
| Morphology instead of simple translation? | Yes — body length, gonial angle, ramus height, symphysis, maxillary basal/alveolar fields; the condyle never leaves the fossa. |
| TMJ and bone structures intact? | Condyles fixed in the fossae; continuous deformation fields (no cracks at sutures); crowns rigid, roots inside bone; incisor/cusp clearance during sagittal morphs. |
| Labels readable on a phone? | Smallest functional text 27 px at 1080 px width (attribution line 20 px). Main labels 30–88 px Montserrat. |
| No disputed numeric diagnostic claims? | None on screen. |
| Correct brand logo? | The CK BIOMECHANICS brand kit (`src/brand.js`): CK in a circle, BIOMECHANICS (one word) below; unchanged proportions; brand background unchanged throughout. |
| Does recording work? | MediaRecorder WebM and WebCodecs MP4 export in the player; the final MP4 in `export/` was produced by the deterministic offline renderer + FFmpeg. |

### Limitations

* One source skull (adult male, BodyParts3D); variants are deformations, not scans of patients.
* Soft tissues are not shown; dental compensations (incisor inclination) are not modelled
  except the small dento-alveolar adjustment needed to keep occlusion.
