# 💧 SWaHM — Sindh Water Historical Monitor

A web-based Geographic Information System (GIS) application built on **Google Earth Engine** for monitoring historical surface water extent of major water bodies in Sindh, Pakistan from **1988 to 2021**.

**Live app:** https://gis-cs-hu.projects.earthengine.app/view/sindh-historical-water-monitor

---

## Overview

Sindh's lakes and reservoirs face compounding stress from floods, drought, sedimentation, and irrigation over-extraction. Decision-makers often lack a simple way to answer: *"Is this water body shrinking or growing, and when did the trend begin?"*

SWaHM answers that question. It uses 34 years of Landsat satellite imagery — processed by the JRC Global Surface Water dataset — to let anyone explore water extent changes across five major Sindh water bodies with no coding or GIS expertise required.

---

## Water Bodies Covered

| Water Body | Type | Significance |
|---|---|---|
| **Manchhar Lake** | Freshwater lake | One of Asia's largest freshwater lakes; critical for fishing communities and flood buffering in Dadu/Sehwan |
| **Keenjhar (Kalri) Lake** | Freshwater lake | Primary drinking water source for Karachi (~16 million people); Ramsar wetland site |
| **Haleji Lake** | Wetland/lake | Ramsar-designated bird sanctuary; supplies parts of Thatta district |
| **Hamal Lake** | Seasonal lake | Northern Sindh; often dries completely in drought years |
| **Hub Reservoir** | Reservoir | Supplies drinking water to parts of Karachi and Lasbela |

---

## Features

- **Select any of the 5 water bodies** or run an All-Lakes overview across all of Sindh simultaneously
- **Set a custom year range** (1988–2021) and analyse long-term surface water trends
- **Choose water type:** all water (seasonal + permanent) or permanent water only
- **Optional buffer expansion:** extend the region of interest beyond the lake's core polygon
- **Map layers generated per analysis:**
  - Water classification for start year and end year (colour-coded: permanent / seasonal / land)
  - Net water gain (green) and water loss (red) pixels between the two years
  - Historic maximum water extent (1984–2021) reference layer
  - Study area boundary overlay
  - Sindh administrative district boundaries
- **Annual trend chart** — surface water area (km²) plotted for every year in the selected range
- **Summary statistics panel:** start km², end km², net change km², % change, peak and trough years
- **Automated risk assessment:** STABLE / WARNING / CRITICAL classification with colour-coded badge
- **Narrative trend analysis:** auto-generated three-paragraph interpretation including known flood year annotations, inter-annual variability commentary, and policy recommendations
- **CSV export** of full per-year statistics with 15 data fields, downloadable directly from the browser
- **All-Lakes overview mode:** simultaneous pixel-level change map and colour-coded comparison table for all five lakes; clickable lake polygons show quick stats in the status panel

---

## Data Sources

| Dataset | GEE Asset ID | Purpose |
|---|---|---|
| JRC Global Surface Water Yearly History | `JRC/GSW1_4/YearlyHistory` | Annual water classification (1988–2021), 30 m resolution |
| JRC Global Surface Water (max extent) | `JRC/GSW1_4/GlobalSurfaceWater` | Historic maximum water extent reference layer |
| HydroLAKES v1.0 | `projects/sat-io/open-datasets/HydroLakes/lake_poly_v10` | Authoritative lake polygon boundaries for region-of-interest generation |
| FAO GAUL 2015 Level 2 | `FAO/GAUL/2015/level2` | Sindh administrative district overlays |

### JRC waterClass band values

| Value | Meaning |
|---|---|
| 0 | No data |
| 1 | Land / not water |
| 2 | Seasonal water |
| 3 | Permanent water |

Data reliability note: JRC data exists from 1984 but Sindh coverage is unreliable before 1988 due to partial Landsat 5 archives and higher cloud contamination rates. The application restricts the selectable range to 1988–2021.

---

## Application Architecture

The entire application is a **single-file Google Earth Engine JavaScript script** (1,284 lines). GEE's client–server model means all heavy spatial computation runs server-side; only UI events and final evaluated results cross the client–server boundary.

### Layout

```
ui.root
└── rootPanel (ui.SplitPanel, horizontal)
    ├── leftColumn (ui.Panel)
    │   └── splitLeft (ui.SplitPanel, horizontal)
    │       ├── ctrlPanel (320 px) — all controls
    │       └── mapPanel (ui.Map) — interactive satellite map
    └── resultsPanel (450 px)
        ├── lblChartTitle
        ├── chartPanel — annual trend line chart
        ├── statsPanel — summary statistics + risk badge + CSV export
        └── insightPanel — narrative analysis + recommendations
```

### Key functions

| Function | Lines | Description |
|---|---|---|
| `lbl(txt, style)` | 79–97 | Styled `ui.Label` factory with default theme |
| `sectionLbl(txt)` | 98–103 | Bold blue section heading label |
| `hr()` | 105–107 | Horizontal divider panel |
| `resultRow(label, value, color)` | 109–113 | Two-column stat row widget |
| `waterThreshold()` | 358–361 | Returns `2` (all water) or `3` (permanent only) based on Water Type selector |
| `resolveROI(name, useBuffer, bufKm)` | 565–578 | Resolves lake boundary from HydroLAKES by `Hylak_id`; optionally unions with a point buffer |
| `getYearImg(y)` | 773–782 | Filters `jrcAll` to a specific year; returns zero image if no data |
| `runBtn.onClick` | 580–1282 | Main analysis pipeline (both single-lake and All-Lakes modes) |

### Analysis pipeline (single lake mode)

```
resolveROI()
  → filterBounds(roi) on JRC collection
  → getYearImg(yStart) + getYearImg(yEnd) → wStart, wEnd (binary water masks)
  → Map layers: classification (start, end), gain (green), loss (red), maxExtent
  → ee.List.sequence(yStart, yEnd).map()
      → per-year: waterClass bands → reduceRegion(sum, scale=100, tileScale=2)
      → FeatureCollection with: area_km2, permanent_water_km2, seasonal_water_km2,
        land_km2, nodata_km2, classified_area_km2 per year
      → filter(notNull('area_km2')) → chartFC
  → ui.Chart.feature.byFeature(chartFC) → LineChart
  → ee.Dictionary.evaluate() → statsPanel + insightPanel population
```

### ROI resolution strategy

`resolveROI` uses authoritative HydroLAKES polygon geometries keyed by `Hylak_id` rather than simple point buffers. This ensures the region of interest follows the actual shoreline contours. When buffer mode is enabled, the HydroLAKES polygon and a point-buffered geometry are unioned, extending the ROI into the surrounding floodplain.

```javascript
var hydro = hydroLakes.filter(ee.Filter.eq('Hylak_id', cfg.hylak_id));
var hydroGeom = hydro.geometry();
if (useBuffer) return hydroGeom.union(seed.buffer(bufferKm * 1000));
return hydroGeom;
```

### Minimum valid pixel guard

Years with fewer than 10 classified pixels (`MIN_VALID_PIXELS = 10`) are excluded from the chart entirely. This prevents cloud-contaminated years from producing near-zero area estimates and breaking the trend line. Excluded years appear as gaps in the chart.

### CSV export schema

The exported CSV contains one row per year within the selected range. Fields:

| Column | Description |
|---|---|
| `water_body` | Lake/reservoir name |
| `year` | Calendar year |
| `total_water_km2` | Total water area (km²) under selected water type filter |
| `permanent_water_km2` | Permanently inundated area (km²) |
| `seasonal_water_km2` | Seasonally inundated area (km²) |
| `land_km2` | Non-water classified area (km²) |
| `nodata_km2` | Area with no satellite data (km²) |
| `classified_area_km2` | Total classified (non-nodata) area (km²) |
| `water_pct_of_classified` | Water area as % of classified area |
| `change_from_start_km2` | Absolute change from start year (km²) |
| `change_from_start_pct` | Percentage change from start year |
| `start_year` | Analysis start year |
| `end_year` | Analysis end year |
| `water_type_filter` | `seasonal_and_permanent` or `permanent_only` |
| `roi_type` | ROI description (polygon only or polygon + buffer size) |
| `data_source` | `JRC/GSW1_4/YearlyHistory` |

---

## Controls Reference

| Control | Type | Default | Description |
|---|---|---|---|
| ① Select Water Body | Dropdown | Manchhar Lake | Choose a lake or "All Sindh Lakes (Overview)" |
| ② Start Year | Slider | 1990 | Analysis start year (1988–2020) |
| ③ End Year | Slider | 2021 | Analysis end year (1989–2021) |
| Expand ROI with buffer | Checkbox | Off | Extends the study area beyond the lake's core polygon |
| ④ Study Area Radius | Slider | Per-lake default | Buffer size in km (visible only when buffer is enabled) |
| ⑤ Water Type | Dropdown | All water | `All water (seasonal + permanent)` or `Permanent water only` |
| ▶ Analyse / ▶ Generate Overview Map | Button | — | Runs the analysis |
| ↺ Reset | Button | — | Clears all layers and resets all controls to defaults |

Controls hidden in All-Lakes Overview mode: buffer checkbox, radius slider, water type selector. The run button label also changes to "Generate Overview Map" in that mode.

---

## Map Legend

**Single lake mode:**

| Colour | Meaning |
|---|---|
| `#084594` (dark blue) | Permanent water |
| `#4292c6` (mid blue) | Seasonal water |
| `#d4c89a` (tan) | Land / not water |
| `#006d2c` (dark green) | Net water GAIN (new water in end year) |
| `#99000d` (dark red) | Net water LOSS (water in start year, gone by end year) |
| `#fd8d3c` (orange) | Study area boundary |

**All-Lakes overview mode (polygon outlines):**

| Colour | Net % change |
|---|---|
| `#006d2c` (dark green) | > +10% — Significant gain |
| `#2171b5` (blue) | −10% to +10% — Stable |
| `#fe9929` (amber) | −30% to −10% — Moderate loss |
| `#cb181d` (red) | < −30% — Severe loss |

---

## Risk Classification

The automated risk assessment uses the percentage change from start year to end year:

| Risk Level | Condition | Badge colour |
|---|---|---|
| STABLE / Recovering | Change > −10% | Green (`#41ab5d`) |
| WARNING / Moderate loss | −30% ≤ change ≤ −10% | Amber (`#fe9929`) |
| CRITICAL / Severe loss | Change < −30% | Red (`#cb181d`) |

---

## Known Flood Years

The narrative engine annotates chart peaks with known historical events:

| Year | Event |
|---|---|
| 1992 | Major Sindh floods |
| 2010 | Pakistan super-floods (worst in recorded history) |
| 2011 | Secondary flood pulse |
| 2015 | Significant localised flooding |
| 2020 | Above-average monsoon flooding |

---

## Limitations

- **Data ends at 2021.** JRC has not released updates beyond this year. The dataset is effectively frozen.
- **30 m spatial resolution.** Small water features below ~1 hectare are below the detection threshold.
- **Monsoon cloud cover.** July–August cloud cover across Sindh often exceeds 70%. Heavily cloud-affected years are filtered out by the minimum valid pixel guard and appear as gaps in the chart.
- **Accuracy estimate:** ±1 km² for large water bodies under low cloud conditions.
- **Permanent/seasonal split is rule-based.** JRC defines "permanent" as water present in more than 8 months of the year averaged over the dataset period — not a per-year per-pixel classification. Treat the permanent/seasonal distinction as indicative.
- **Field verification recommended** before using outputs for operational water resource management or policy decisions.

---

## Development Notes

### Reducing compute cost

The JRC collection is filtered once per analysis with `filterBounds(roi)` and assigned to `jrcAll`. All per-year image retrievals reuse this filtered collection rather than issuing separate full-collection queries.

```javascript
var jrcAll = ee.ImageCollection(JRC_ID).filterBounds(roi);
```

`reduceRegion` uses `scale: 100` (not the native 30 m) for the annual stats loop. For the lake sizes in this project (5–1200 km²), this reduces compute time by ~10× with negligible accuracy impact. `tileScale: 2` is also set to prevent memory errors on large ROIs like Manchhar.

### Async pattern

All server-side computation is deferred and resolved through `.evaluate()` callbacks. The UI is never blocked. The `runBtn` is disabled for the duration of the async call and re-enabled inside both the success and error branches of the callback.

### UI visibility pattern

Control panels are shown/hidden using `widget.style().set('shown', bool)` rather than `add()`/`remove()`. This avoids panel reflow and preserves widget state (e.g. slider position) across mode switches.

---

## Project Information

| Field | Detail |
|---|---|
| Course | CE 376 / CS 358 — Geographic Information Systems |
| Semester | Spring 2026 |
| Institution | Habib University, Karachi |
| Group | Group 11 |
| Authors | M Sufyan Siddiqui, Sameer Hassan |
| Instructor | Dr. Umer Tariq |
| Platform | Google Earth Engine (JavaScript API) |
| Citation (data) | Pekel et al., *Nature* 541, 418–422 (2017). doi:10.1038/nature20584 |

---

