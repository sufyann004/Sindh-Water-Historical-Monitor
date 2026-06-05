
//  SWaHM - Sindh Water Body Historical Monitor
//  Periodic Surface Water History of Major Water Bodies in Sindh
//  Course  : CE 376 / CS 358 - Geographic Information Systems
//  Semester: Spring 2026 | Habib University
//  Group 11: M Sufyan Siddiqui | Sameer Hassan
//  Instructor: Dr. Umer Tariq
//  DATA SOURCES
//  • JRC/GSW1_4/YearlyHistory - Landsat-derived annual surface water
//    classification at 30 m resolution, 1984-2021 (reliable for Sindh from ~1988).
//    Band: waterClass  (0=no data, 1=not water, 2=seasonal, 3=permanent)
//    Source: Joint Research Centre / Google
//
//  • FAO/GAUL/2015/level2 - Administrative boundaries (Sindh districts)
//    Used for geographic context layer.
//



var YEAR_MIN = 1988;
var YEAR_MAX = 2021;
var JRC_ID = 'JRC/GSW1_4/YearlyHistory';
var GAUL_ID = 'FAO/GAUL/2015/level2';
var HYDROLAKES_ID = 'projects/sat-io/open-datasets/HydroLakes/lake_poly_v10';

// Colour palette for waterClass (0-3)
//  0=no data, 1=not water, 2=seasonal, 3=permanent
var WATER_VIZ = { min: 0, max: 3, palette: ['#bdbdbd', '#d4c89a', '#4292c6', '#084594'] };

var GAIN_COLOR = '#006d2c';   // green - new water
var LOSS_COLOR = '#99000d';   // red - lost water
var ROI_COLOR  = '#fd8d3c';   // orange - study area ring



// Known major flood years in Sindh (for narrative annotation)
var KNOWN_FLOOD_YEARS = {
    1992: 'Major Sindh floods',
    2010: 'Pakistan super-floods (worst in recorded history)',
    2011: 'Secondary flood pulse',
    2015: 'Significant localised flooding',
    2020: 'Above-average monsoon flooding'
};

// Domain context per water body for richer narratives
var WATER_BODY_CONTEXT = {
    'Manchhar Lake':           { type: 'lake',      significance: 'one of Asia\'s largest freshwater lakes; critical for fishing communities and flood buffering in Dadu/Sehwan' },
    'Keenjhar (Kalri) Lake':   { type: 'lake',      significance: 'primary drinking water source for Karachi (population ~16 million); Ramsar wetland site' },
    'Haleji Lake':             { type: 'lake',      significance: 'Ramsar-designated wetland and bird sanctuary; supplies water to parts of Thatta district' },
    'Hamal Lake':              { type: 'lake',      significance: 'seasonal lake in northern Sindh; often dries completely in drought years' },
    'Hub Reservoir':           { type: 'reservoir',  significance: 'supplies drinking water to parts of Karachi and Lasbela; highly dependent on rainfall' }
};


// Format: name -> { lon, lat, hylak_id, buf (fallback buffer in metres) }
var WATER_BODIES = {
    'Manchhar Lake':                { lon: 67.630, lat: 26.430, hylak_id: 15458, buf: 20000 },
    'Keenjhar (Kalri) Lake':        { lon: 68.030, lat: 24.970, hylak_id: 1482, buf: 11000 },
    'Haleji Lake':                  { lon: 67.740, lat: 24.790, hylak_id: 15500, buf:  5000 },
    'Hamal Lake':                   { lon: 67.632, lat: 27.449, hylak_id: 176827, buf:  7500 },
    'Hub Reservoir':                { lon: 67.150, lat: 25.300, hylak_id: 15485, buf:  6000 }
};

var LAKE_NAMES = Object.keys(WATER_BODIES);
var verifiedLakeNames = LAKE_NAMES;

var sindhDistricts = ee.FeatureCollection(GAUL_ID)
    .filter(ee.Filter.eq('ADM1_NAME', 'Sindh'));

var hydroLakes = ee.FeatureCollection(HYDROLAKES_ID);

// Map panel only - do not use global Map for SplitPanel (must be ui.Map).
var mapPanel = ui.Map();
mapPanel.setCenter(68.5, 26.2, 7);
mapPanel.setOptions('HYBRID');
mapPanel.setControlVisibility({ mapTypeControl: true, layerList: true });


function lbl(txt, style) {
    var defaultStyle = {
        color: '#475569',
        fontSize: '13px',
        fontFamily: 'Roboto, sans-serif',
        margin: '3px 0',
        backgroundColor: '#F8FAFC'
    };

    if (style) {
        for (var key in style) {
            if (style.hasOwnProperty(key)) {
                defaultStyle[key] = style[key];
            }
        }
    }

    return ui.Label(txt, defaultStyle);
}
function sectionLbl(txt) {
    return lbl(txt, {
        fontWeight: 'bold', fontSize: '12px',
        margin: '14px 0 6px 0', color: '#0284C7', backgroundColor: '#F8FAFC'
    });
}

function hr() {
    return ui.Panel({ style: { height: '1px', backgroundColor: '#E2E8F0', margin: '16px 0' } });
}

function resultRow(labelTxt, valueTxt, valueColor) {
    return ui.Panel([
        lbl(labelTxt, { color: '#64748B', fontSize: '13px', width: '150px' }),
        lbl(valueTxt, { color: valueColor || '#1E293B', fontWeight: 'bold', fontSize: '13px' })
    ], ui.Panel.Layout.flow('horizontal'), { margin: '4px 0', backgroundColor: '#FFFFFF' });
}



var ctrlPanel = ui.Panel({
    style: {
        width: '320px',
        padding: '24px 20px 24px 20px',
        backgroundColor: '#F8FAFC',
        stretch: 'vertical'
    }
});

// Header
ctrlPanel.add(lbl('💧 SWaHM', {
    fontSize: '28px', fontWeight: 'bold', color: '#0284C7', margin: '0 0 4px 0', backgroundColor: '#F8FAFC'
}));
ctrlPanel.add(lbl('Sindh Water Historical Monitor', {
    fontSize: '12px', fontWeight: 'bold', color: '#64748B', margin: '0 0 8px 0', backgroundColor: '#F8FAFC'
}));

var aboutBtn = ui.Button({
    label: 'ℹ  About this App',
    style: { width: '150px', color: '#0284C7', fontWeight: 'bold', fontSize: '11px', margin: '0 0 6px 0' }
});

var aboutOverlay = ui.Panel({
    style: {
        width: '560px',
        maxHeight: '85%',
        padding: '28px 32px',
        backgroundColor: '#FFFFFF',
        border: '2px solid #0284C7',
        position: 'top-center',
        shown: false
    }
});

var closeAboutBtn = ui.Button({
    label: '✕ Close',
    style: { color: '#B91C1C', fontWeight: 'bold', fontSize: '12px', margin: '0' }
});
closeAboutBtn.onClick(function () { aboutOverlay.style().set('shown', false); });

function aboutHeading(txt) {
    return lbl(txt, { fontWeight: 'bold', fontSize: '13px', color: '#0284C7', margin: '16px 0 6px 0', backgroundColor: '#FFFFFF' });
}
function aboutText(txt) {
    return lbl(txt, { fontSize: '12px', color: '#334155', whiteSpace: 'pre-wrap', margin: '0 0 4px 0', backgroundColor: '#FFFFFF' });
}
function aboutDivider() {
    return ui.Panel({ style: { height: '1px', backgroundColor: '#E2E8F0', margin: '14px 0' } });
}

aboutOverlay.add(ui.Panel([
    lbl('💧 SWaHM', { fontSize: '22px', fontWeight: 'bold', color: '#0284C7', margin: '0', backgroundColor: '#FFFFFF' }),
    closeAboutBtn
], ui.Panel.Layout.flow('horizontal'), { backgroundColor: '#FFFFFF', margin: '0 0 4px 0' }));

aboutOverlay.add(lbl('Sindh Water Body Historical Monitor', {
    fontSize: '14px', fontWeight: 'bold', color: '#334155', margin: '0 0 2px 0', backgroundColor: '#FFFFFF'
}));
aboutOverlay.add(lbl(
    'A Geographic Decision Support System for monitoring surface water changes across Sindh\'s major water bodies.',
    { fontSize: '12px', color: '#64748B', margin: '0 0 6px 0', backgroundColor: '#FFFFFF' }
));

aboutOverlay.add(aboutDivider());

aboutOverlay.add(aboutHeading('What is this app?'));
aboutOverlay.add(aboutText(
    'Sindh\'s lakes and reservoirs, from Manchhar Lake (one of Asia\'s largest) to ' +
    'Hub Reservoir, face severe stress from floods, drought, sedimentation, and ' +
    'irrigation over-extraction. Decision-makers often lack a simple way to answer:\n\n' +
    '    "Is this water body shrinking or growing, and when did\n' +
    '     the trend begin?"\n\n' +
    'SWaHM answers that question. It uses over 30 years of satellite imagery (1988 to 2021) ' +
    'to let you explore water extent changes with just a few clicks. No coding or ' +
    'GIS expertise is required.'
));

aboutOverlay.add(aboutHeading('Application Capabilities'));
aboutOverlay.add(aboutText(
    '• Select a lake or reservoir, define a time range\n' +
    '   (start year to end year), and perform annual surface\n' +
    '   water analysis to observe long-term temporal changes\n' +
    '   across the selected water body.\n\n' +
    '• Analyse different water types (permanent and seasonal)\n' +
    '   and visualise their spatial distribution and variation\n' +
    '   over time on an interactive map.\n\n' +
    '• Identify and visualise net water change, including\n' +
    '   water gain (shown in green) and water loss (shown in\n' +
    '   red), for the selected region and time period.\n\n' +
    '• Analyse lakes using buffer regions, enabling the study\n' +
    '   of both the core water body and its surrounding\n' +
    '   environmental changes.\n\n' +
    '• View statistical summaries, risk assessments, and\n' +
    '   trend-based charts representing annual water extent\n' +
    '   variations over the chosen study period.\n\n' +
    '• Export the generated spatial and statistical results\n' +
    '   in CSV format for further external analysis and\n' +
    '   reporting in tools like Excel or Google Sheets.'
));

aboutOverlay.add(aboutHeading('Water Bodies Covered'));
aboutOverlay.add(aboutText(
    '  • Manchhar Lake: One of Asia\'s largest freshwater lakes,\n' +
    '     critical for fishing communities and flood buffering.\n' +
    '  • Keenjhar (Kalri) Lake: Primary drinking water source\n' +
    '     for Karachi (~16 million people), Ramsar wetland site.\n' +
    '  • Haleji Lake: Ramsar-designated wetland and bird\n' +
    '     sanctuary, supplies water to parts of Thatta district.\n' +
    '  • Hamal Lake: Seasonal lake in northern Sindh, often\n' +
    '     dries completely in drought years.\n' +
    '  • Hub Reservoir: Supplies drinking water to parts of\n' +
    '     Karachi and Lasbela, highly dependent on rainfall.'
));

aboutOverlay.add(aboutHeading('Data Sources'));
aboutOverlay.add(aboutText(
    '  • JRC Global Surface Water v1.4 (YearlyHistory)\n' +
    '     Annual water classification at 30 m resolution\n' +
    '     derived from Landsat 5, 7, and 8 imagery (1988-2021)\n\n' +
    '  • JRC Global Surface Water (max_extent band)\n' +
    '     Historic maximum water extent composite\n\n' +
    '  • FAO GAUL 2015 Level 2\n' +
    '     Administrative boundaries for Sindh districts\n\n' +
    '  • HydroLAKES v1.0\n' +
    '     Global lake polygon database used for precise\n' +
    '     shoreline-based regions of interest'
));

aboutOverlay.add(aboutDivider());

aboutOverlay.add(lbl(
    'Course: CE 376 / CS 358 - Geographic Information Systems\n' +
    'Semester: Spring 2026  |  Habib University\n' +
    'Group 11: M Sufyan Siddiqui  |  Sameer Hassan\n' +
    'Instructor: Dr. Umer Tariq\n\n' +
    'Built on Google Earth Engine. Powered by Landsat archive.',
    { fontSize: '10px', color: '#94A3B8', whiteSpace: 'pre', margin: '0 0 12px 0', backgroundColor: '#FFFFFF' }
));

aboutOverlay.add(ui.Label({
    value: 'View Project Report (PDF)',
    style: { fontSize: '11px', color: '#0284C7', fontWeight: 'bold', margin: '0 0 4px 0', backgroundColor: '#FFFFFF' },
    targetUrl: 'https://drive.google.com/file/d/18K-qL1XPDa5f4WuC5s2Fz95Jg76F4nnS/view?usp=sharing'
}));

aboutBtn.onClick(function () {
    var shown = aboutOverlay.style().get('shown');
    aboutOverlay.style().set('shown', !shown);
});

ctrlPanel.add(aboutBtn);
ctrlPanel.add(hr());

// Water body selector
var lblWaterBody = sectionLbl('① Select Water Body');
ctrlPanel.add(lblWaterBody);

var bodySelectItems = ['All Sindh Lakes (Overview)'].concat(LAKE_NAMES);
var bodySelect = ui.Select({
    items: bodySelectItems,
    value: 'Manchhar Lake',
    style: { width: '260px', margin: '4px 8px 4px 8px', backgroundColor: '#F8FAFC' }
});

ctrlPanel.add(bodySelect);
ctrlPanel.add(hr());

// Start year
var lblStartYear = sectionLbl('② Start Year');
ctrlPanel.add(lblStartYear);
var startSlider = ui.Slider({
    min: YEAR_MIN, max: 2020, value: 1990, step: 1,
    style: { width: '258px', backgroundColor: '#F8FAFC' }
});
var startLbl = lbl('1990', { fontSize: '11px', color: '#64748B', backgroundColor: '#F8FAFC' });
ctrlPanel.add(startSlider);
ctrlPanel.add(startLbl);
startSlider.onChange(function (v) {
    startLbl.setValue(String(Math.round(v)));
});

// End year
var lblEndYear = sectionLbl('③ End Year');
ctrlPanel.add(lblEndYear);
var endSlider = ui.Slider({
    min: YEAR_MIN + 1, max: 2021, value: 2021, step: 1,
    style: { width: '258px', backgroundColor: '#F8FAFC' }
});
var endLbl = lbl('2021', { fontSize: '11px', color: '#64748B', backgroundColor: '#F8FAFC' });
ctrlPanel.add(endSlider);
ctrlPanel.add(endLbl);
endSlider.onChange(function (v) {
    endLbl.setValue(String(Math.round(v)));
});

ctrlPanel.add(hr());

// Buffer Checkbox
var bufferCheckbox = ui.Checkbox({
  label: 'Expand ROI with buffer radius',
  value: false,
  style: { margin: '6px 8px', fontSize: '12px', backgroundColor: '#F8FAFC' }
});
ctrlPanel.add(bufferCheckbox);

// Radius
var lblRadius = sectionLbl('④ Study Area Radius (km)');
ctrlPanel.add(lblRadius);
var radiusSlider = ui.Slider({
    min: 1, max: 30, value: WATER_BODIES['Manchhar Lake'].buf / 1000, step: 0.5,
    style: { width: '258px', backgroundColor: '#F8FAFC' }
});
var radiusLbl = lbl(String(WATER_BODIES['Manchhar Lake'].buf / 1000) + ' km', { fontSize: '11px', color: '#64748B', backgroundColor: '#F8FAFC' });
ctrlPanel.add(radiusSlider);
ctrlPanel.add(radiusLbl);

bufferCheckbox.onChange(function(checked) {
  radiusSlider.style().set('shown', checked);
  radiusLbl.style().set('shown', checked);
  lblRadius.style().set('shown', checked);
});
radiusSlider.style().set('shown', false);
radiusLbl.style().set('shown', false);
lblRadius.style().set('shown', false);

radiusSlider.onChange(function (v) {
    radiusLbl.setValue(v.toFixed(1) + ' km');
});

ctrlPanel.add(hr());
var lblWaterType = sectionLbl('⑤ Water Type');
ctrlPanel.add(lblWaterType);

var waterTypeSelect = ui.Select({
  items: ['All water (seasonal + permanent)', 'Permanent water only'],
  value: 'All water (seasonal + permanent)',
  style: { width: '260px', margin: '4px 8px', backgroundColor: '#F8FAFC' }
});
ctrlPanel.add(waterTypeSelect);

function waterThreshold() {
  var sel = waterTypeSelect.getValue();
  return sel === 'Permanent water only' ? 3 : 2;
}

bodySelect.onChange(function(name) {
    var isAllMode = name === 'All Sindh Lakes (Overview)';
    bufferCheckbox.style().set('shown', !isAllMode);
    var checked = bufferCheckbox.getValue();
    radiusSlider.style().set('shown', !isAllMode && checked);
    radiusLbl.style().set('shown', !isAllMode && checked);
    lblRadius.style().set('shown', !isAllMode && checked);
    waterTypeSelect.style().set('shown', !isAllMode);
    lblWaterType.style().set('shown', !isAllMode);
    mainLegendPanel.style().set('shown', !isAllMode);
    allLakesLegend.style().set('shown', isAllMode);
    runBtn.setLabel(isAllMode ? '▶  Generate Overview Map' : '▶  Analyse');
    
    if (!isAllMode) {
        var cfg = WATER_BODIES[name];
        radiusSlider.setValue(cfg.buf / 1000);
    }
});

ctrlPanel.add(hr());

// Run and Reset buttons
var runBtn = ui.Button({
    label: '▶  Analyse',
    style: {
        width: '180px', color: '#0284C7',
        fontWeight: 'bold', margin: '8px 0 6px 0', backgroundColor: '#F8FAFC'
    }
});
var resetBtn = ui.Button({
    label: '↺ Reset',
    style: {
        width: '74px', margin: '8px 0 6px 6px',
        fontWeight: 'bold', color: '#B91C1C', backgroundColor: '#F8FAFC'
    }
});
var btnRow = ui.Panel([runBtn, resetBtn], ui.Panel.Layout.flow('horizontal'), {backgroundColor: '#F8FAFC'});
ctrlPanel.add(btnRow);

resetBtn.onClick(function() {
    mapPanel.layers().reset();
    chartPanel.clear();
    statsPanel.clear();
    insightPanel.clear();
    statusLbl.setValue('👆 Select a water body\n   Set year range\n   Press Analyse\n\nTip: Toggle layers to compare start vs end year.');
    var defaultCfg = WATER_BODIES['Manchhar Lake'];
    bodySelect.setValue('Manchhar Lake');
    startSlider.setValue(1990);
    endSlider.setValue(2021);
    radiusSlider.setValue(defaultCfg.buf / 1000);
    bufferCheckbox.setValue(false);
    waterTypeSelect.setValue('All water (seasonal + permanent)');
    runBtn.setDisabled(false);
    statusPanel.style().set('border', '2px solid #F59E0B');
});

// Status
ctrlPanel.add(hr());
var statusLbl = lbl(
    'Select a water body\n   Set year range\n   Press Analyse\n\n' +
    'Tip: Toggle layers to compare start vs end year.',
    { whiteSpace: 'pre', fontSize: '12px', color: '#475569', backgroundColor: '#FFFFFF' }
);
var statusPanel = ui.Panel({ style: { backgroundColor: '#FFFFFF', padding: '12px', border: '2px solid #F59E0B', margin: '10px 0' } });
statusPanel.add(statusLbl);
ctrlPanel.add(statusPanel);

// Legend
ctrlPanel.add(hr());
ctrlPanel.add(sectionLbl('Legend'));

var mainLegendPanel = ui.Panel({style: {backgroundColor: '#F8FAFC'}});

var legendDefs = [
    { color: '#084594', text: 'Permanent water' },
    { color: '#4292c6', text: 'Seasonal water' },
    { color: '#d4c89a', text: 'Land / not water' },
    { color: GAIN_COLOR, text: 'Net water GAIN' },
    { color: LOSS_COLOR, text: 'Net water LOSS' },
    { color: ROI_COLOR, text: 'Study area boundary' },
];

legendDefs.forEach(function (d) {
    mainLegendPanel.add(ui.Panel([
        ui.Label({
            value: '■',
            style: {
                color: d.color,
                fontSize: '14px',
                margin: '0 8px 0 0',
                backgroundColor: '#F8FAFC'
            }
        }),
        lbl(d.text, { margin: '2px 0', fontSize: '11px', color: '#475569', backgroundColor: '#F8FAFC' })
    ], ui.Panel.Layout.flow('horizontal'), {backgroundColor: '#F8FAFC'}));
});
ctrlPanel.add(mainLegendPanel);

// All Lakes Legend
var allLakesLegend = ui.Panel({ style: { shown: false, backgroundColor: '#F8FAFC' } });
allLakesLegend.add(lbl('Polygon outline (Net % Change):', { fontSize: '11px', color: '#475569', margin: '4px 0', backgroundColor: '#F8FAFC' }));

var makeColorRow = function(color, text) {
    return ui.Panel([
        ui.Label('■', { color: color, fontSize: '14px', margin: '0 8px 0 0', backgroundColor: '#F8FAFC' }),
        lbl(text, { fontSize: '11px', color: '#475569', backgroundColor: '#F8FAFC' })
    ], ui.Panel.Layout.flow('horizontal'), {backgroundColor: '#F8FAFC'});
};

allLakesLegend.add(makeColorRow('#006d2c', '> +10% (Significant Gain)'));
allLakesLegend.add(makeColorRow('#2171b5', '-10% to +10% (Stable)'));
allLakesLegend.add(makeColorRow('#fe9929', '-30% to -10% (Moderate Loss)'));
allLakesLegend.add(makeColorRow('#cb181d', '< -30% (Severe Loss)'));

allLakesLegend.add(lbl('Pixel colours:', { fontSize: '11px', color: '#475569', margin: '8px 0 4px 0', backgroundColor: '#F8FAFC' }));
allLakesLegend.add(makeColorRow('#006d2c', 'Water Gain (new water)'));
allLakesLegend.add(makeColorRow('#2171b5', 'No Change (stable water)'));
allLakesLegend.add(makeColorRow('#cb181d', 'Water Loss (lost water)'));

ctrlPanel.add(allLakesLegend);

// About overlay added to map
mapPanel.add(aboutOverlay);


var chartPanel = ui.Panel({ style: { backgroundColor: '#FFFFFF', padding: '10px', margin: '14px 16px', border: '1px solid #E2E8F0' } });
var statsPanel = ui.Panel({ style: { backgroundColor: '#FFFFFF', padding: '16px', margin: '0 16px 16px 16px', border: '1px solid #E2E8F0' } });
var insightPanel = ui.Panel({ style: { backgroundColor: '#FFFBEB', padding: '16px', margin: '0 16px 16px 16px', border: '1px solid #FCD34D' } });

chartPanel.add(lbl(
    'Analysis results will appear here after you click Analyse.',
    { color: '#94A3B8', fontSize: '13px', padding: '20px', fontFamily: 'Roboto' }
));

var lblChartTitle = lbl('Surface Water Area Trend', {
        fontSize: '16px', fontWeight: 'bold', color: '#0F172A',
        padding: '16px 16px 0 16px', margin: '0'
    });

var resultsPanel = ui.Panel([
    lblChartTitle,
    chartPanel,
    statsPanel,
    insightPanel
], ui.Panel.Layout.flow('vertical'), {
    width: '450px',
    backgroundColor: '#F8FAFC',
    border: '1px solid #CBD5E1'
});


// ui.SplitPanel may only contain ui.Panel or ui.Map, not another SplitPanel.
// Wrap the left split (controls | map) in a Panel before nesting under root.

var splitLeft = ui.SplitPanel({
    firstPanel: ctrlPanel,
    secondPanel: mapPanel,
    orientation: 'horizontal',
    wipe: false,
    style: { stretch: 'both' }
});

var leftColumn = ui.Panel([splitLeft], ui.Panel.Layout.flow('horizontal'), {
    stretch: 'both'
});

var rootPanel = ui.SplitPanel({
    firstPanel: leftColumn,
    secondPanel: resultsPanel,
    orientation: 'horizontal',
    wipe: false,
    style: { stretch: 'both' }
});

ui.root.clear();
ui.root.add(rootPanel);


var currentLakeChangeFC = null;

mapPanel.onClick(function(coords) {
    if (bodySelect.getValue() !== 'All Sindh Lakes (Overview)') return;
    if (!currentLakeChangeFC) return;

    statusLbl.setValue('Fetching lake data...');
    var clickPoint = ee.Geometry.Point([coords.lon, coords.lat]);
    var selected = currentLakeChangeFC.filterBounds(clickPoint);
    
    selected.size().evaluate(function(s) {
        if (s > 0) {
            selected.first().toDictionary(['name', 'pctChange']).evaluate(function(d) {
                var pct = Number(d.pctChange);
                var pctStr = (pct > 0 ? '+' : '') + pct.toFixed(1) + '%';
                statusLbl.setValue('Selected: ' + d.name + '\n   Net Change: ' + pctStr + '\n   (Switch to individual mode for details)');
            });
        } else {
            statusLbl.setValue('Done\n   All Lakes Overview');
        }
    });
});
mapPanel.style().set('cursor', 'crosshair');

function resolveROI(name, useBuffer, bufferKm) {
  var cfg = WATER_BODIES[name];
  var seed = ee.Geometry.Point([cfg.lon, cfg.lat]);

  var hydro = cfg.hylak_id
    ? hydroLakes.filter(ee.Filter.eq('Hylak_id', cfg.hylak_id))
    : hydroLakes.filterBounds(seed.buffer(3000));

  var hydroGeom = hydro.geometry();
  if (useBuffer) {
    return hydroGeom.union(seed.buffer(bufferKm * 1000));
  }
  return hydroGeom;
}

runBtn.onClick(function () {
    var name = bodySelect.getValue();
    var isAllMode = name === 'All Sindh Lakes (Overview)';
    var yStart = Math.round(startSlider.getValue());
    var yEnd = Math.round(endSlider.getValue());
    var thresh = waterThreshold();

    if (yStart >= yEnd) {
        statusLbl.setValue('⚠ Invalid range: Start year must be less than End year');
        return;
    }

    var yearSpan = yEnd - yStart;
    if (yearSpan < 2) {
        statusLbl.setValue('⚠ Choose at least 2 years between start and end\n   for a meaningful trend.');
        return;
    }

    runBtn.setDisabled(true);
    statusPanel.style().set('border', '2px solid #F59E0B');
    statusLbl.setValue('Loading...\n   Preparing study area and imagery.');

    mapPanel.layers().reset();
    chartPanel.clear();
    statsPanel.clear();
    insightPanel.clear();

    if (isAllMode) {
        statusLbl.setValue('Processing Overview...\n   Computing regional changes.');
        mapPanel.centerObject(sindhDistricts, 7);
        mapPanel.addLayer(
            sindhDistricts.style({ color: '#aaaaaa', fillColor: '00000000', width: 1 }),
            {}, 'Sindh Districts', true
        );

        var lakesUnion = ee.FeatureCollection(verifiedLakeNames.map(function(ln) {
            var cfg = WATER_BODIES[ln];
            return hydroLakes.filter(ee.Filter.eq('Hylak_id', cfg.hylak_id)).first().set('lake_name', ln);
        }));

        var jrcStart = ee.ImageCollection(JRC_ID)
            .filter(ee.Filter.calendarRange(yStart, yStart, 'year'))
            .first();
            
        var jrcEnd = ee.ImageCollection(JRC_ID)
            .filter(ee.Filter.calendarRange(yEnd, yEnd, 'year'))
            .first();
            
        var jrcStartImg = ee.Image(ee.Algorithms.If(jrcStart, jrcStart.select('waterClass'), ee.Image.constant(0).rename('waterClass')));
        var jrcEndImg = ee.Image(ee.Algorithms.If(jrcEnd, jrcEnd.select('waterClass'), ee.Image.constant(0).rename('waterClass')));

        var wStartAll = jrcStartImg.gte(thresh).rename('water');
        var wEndAll   = jrcEndImg.gte(thresh).rename('water');

        var pixelChange = wEndAll.subtract(wStartAll).rename('change');
        var everWater = wStartAll.or(wEndAll);
        var pixelChangeImg = pixelChange.updateMask(everWater).clip(lakesUnion.geometry());

        var changeViz = {
          min: -1, max: 1,
          palette: ['#cb181d', '#2171b5', '#006d2c']
        };
        mapPanel.addLayer(pixelChangeImg, changeViz, 'Pixel Change - All Lakes', true);

        currentLakeChangeFC = ee.FeatureCollection(verifiedLakeNames.map(function(ln) {
            var cfg = WATER_BODIES[ln];
            var poly = hydroLakes.filter(ee.Filter.eq('Hylak_id', cfg.hylak_id)).first();
            var geom = poly.geometry();
            
            var sArea = wStartAll.multiply(ee.Image.pixelArea()).reduceRegion({
                reducer: ee.Reducer.sum(), geometry: geom, scale: 100, maxPixels: 1e10
            }).getNumber('water').divide(1e6);
            
            var eArea = wEndAll.multiply(ee.Image.pixelArea()).reduceRegion({
                reducer: ee.Reducer.sum(), geometry: geom, scale: 100, maxPixels: 1e10
            }).getNumber('water').divide(1e6);
            
            var delta = eArea.subtract(sArea);
            var pct = ee.Algorithms.If(sArea.gt(1e-6), delta.divide(sArea).multiply(100), ee.Number(0));
            
            var colorStr = ee.Algorithms.If(ee.Number(pct).lt(-30), '#cb181d',
                            ee.Algorithms.If(ee.Number(pct).lt(-10), '#fe9929',
                            ee.Algorithms.If(ee.Number(pct).lt(10), '#2171b5', '#006d2c')));

            // styleProperty requires a dictionary, not a plain string
            var styleDict = ee.Dictionary({
                color: colorStr,
                width: 2,
                fillColor: '00000000'
            });

            return ee.Feature(poly.geometry(), { name: ln, pctChange: pct, startKm2: sArea, endKm2: eArea, style: styleDict });
        }));

        mapPanel.addLayer(
          currentLakeChangeFC.style({ styleProperty: 'style' }),
          {}, 'Lake Change Summary', true
        );

        statsPanel.add(lbl('All Sindh Lakes - Net Change Overview', { fontWeight: 'bold', fontSize: '14px', color: '#0F172A', margin: '0 0 6px 0' }));
        statsPanel.add(lbl(yStart + ' to ' + yEnd, { fontSize: '12px', color: '#64748B', margin: '0 0 12px 0' }));
        statsPanel.add(lbl('Loading per-lake statistics...', { fontSize: '12px', color: '#94A3B8', fontStyle: 'italic' }));

        currentLakeChangeFC.evaluate(function(fcResult, fcError) {
            statsPanel.clear();
            if (fcError) {
                statsPanel.add(lbl('Error loading lake stats: ' + fcError, { color: '#c00', fontSize: '11px' }));
                runBtn.setDisabled(false);
                return;
            }

            statsPanel.add(lbl('All Sindh Lakes - Net Change Overview', { fontWeight: 'bold', fontSize: '14px', color: '#0F172A', margin: '0 0 6px 0' }));
            statsPanel.add(lbl(yStart + ' to ' + yEnd, { fontSize: '12px', color: '#64748B', margin: '0 0 12px 0' }));

            // Header row
            statsPanel.add(ui.Panel([
                lbl('Water Body', { fontWeight: 'bold', fontSize: '11px', color: '#0F172A', width: '160px' }),
                lbl('Start km²', { fontWeight: 'bold', fontSize: '11px', color: '#0F172A', width: '70px' }),
                lbl('End km²', { fontWeight: 'bold', fontSize: '11px', color: '#0F172A', width: '70px' }),
                lbl('Change', { fontWeight: 'bold', fontSize: '11px', color: '#0F172A', width: '80px' })
            ], ui.Panel.Layout.flow('horizontal'), { margin: '0 0 4px 0', backgroundColor: '#FFFFFF' }));

            statsPanel.add(ui.Panel({ style: { height: '1px', backgroundColor: '#E2E8F0', margin: '2px 0' } }));

            var features = fcResult.features || [];
            features.forEach(function(f) {
                var props = f.properties;
                var pct = Number(props.pctChange);
                var pctStr = (pct > 0 ? '+' : '') + pct.toFixed(1) + '%';
                var rowColor;
                if (pct < -30) rowColor = '#cb181d';
                else if (pct < -10) rowColor = '#fe9929';
                else if (pct < 10) rowColor = '#2171b5';
                else rowColor = '#006d2c';

                var startKm2 = Number(props.startKm2);
                var endKm2 = Number(props.endKm2);

                statsPanel.add(ui.Panel([
                    lbl(props.name, { fontSize: '11px', color: '#334155', width: '160px', backgroundColor: '#FFFFFF' }),
                    lbl(startKm2.toFixed(1), { fontSize: '11px', color: '#475569', width: '70px', backgroundColor: '#FFFFFF' }),
                    lbl(endKm2.toFixed(1), { fontSize: '11px', color: '#475569', width: '70px', backgroundColor: '#FFFFFF' }),
                    lbl(pctStr, { fontSize: '11px', fontWeight: 'bold', color: rowColor, width: '80px', backgroundColor: '#FFFFFF' })
                ], ui.Panel.Layout.flow('horizontal'), { margin: '2px 0', backgroundColor: '#FFFFFF' }));
            });

            statsPanel.add(ui.Panel({ style: { height: '1px', backgroundColor: '#E2E8F0', margin: '8px 0' } }));
            statsPanel.add(lbl('Select an individual lake from the dropdown for full trend analysis with chart and recommendations.', { fontSize: '11px', color: '#64748B', fontStyle: 'italic', backgroundColor: '#FFFFFF' }));

            runBtn.setDisabled(false);
        });
        
        statusLbl.setValue('Processing...\n   Computing per-lake statistics.');
        statusPanel.style().set('border', '2px solid #F59E0B');
        return;
    }

    var useBuffer = bufferCheckbox.getValue();
    var bufKm = useBuffer ? radiusSlider.getValue() : 0;
    var roi = resolveROI(name, useBuffer, bufKm);
    var roiType = useBuffer ? 'HydroLAKES polygon + ' + bufKm.toFixed(1) + ' km buffer' : 'HydroLAKES polygon (no buffer)';

    // layers/panels already cleared above (L546-549)

    statusLbl.setValue('Processing...\n   Computing areas and chart (15-30 s).');

    mapPanel.centerObject(roi, 10);

    mapPanel.addLayer(
        sindhDistricts.style({ color: '#aaaaaa', fillColor: '00000000', width: 1 }),
        {}, 'Sindh Districts', true
    );

    mapPanel.addLayer(
        ee.Image().paint(ee.FeatureCollection([ee.Feature(roi)]), 1, 2),
        { palette: [ROI_COLOR] },
        'Study Area - ' + name,
        true
    );

    var maxExtentImg = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('max_extent');
    // Ensure 1s indicate historic max water
    var maxExtentMask = maxExtentImg.eq(1).clip(roi).selfMask();
    mapPanel.addLayer(
        maxExtentMask,
        { palette: ['#9ecae1'] },
        'Historic maximum extent (1984-2021)',
        false
    );

    // Load JRC once per analysis, reuse for all years
    var jrcAll = ee.ImageCollection(JRC_ID).filterBounds(roi);

    function getYearImg(y) {
        var img = jrcAll
            .filter(ee.Filter.calendarRange(y, y, 'year'))
            .first();
        return ee.Image(ee.Algorithms.If(
            img,
            img,
            ee.Image.constant(0).rename('waterClass').clip(roi)
        ));
    }

    var imgStart = getYearImg(yStart);
    var imgEnd = getYearImg(yEnd);

    var wStart = imgStart.select('waterClass').gte(thresh).rename('water');
    var wEnd = imgEnd.select('waterClass').gte(thresh).rename('water');

    mapPanel.addLayer(
        imgEnd.select('waterClass').clip(roi),
        WATER_VIZ,
        'Water Classification - ' + yEnd,
        true
    );

    mapPanel.addLayer(
        imgStart.select('waterClass').clip(roi),
        WATER_VIZ,
        'Water Classification - ' + yStart,
        false
    );

    var lossImg = wStart.and(wEnd.not()).selfMask().clip(roi);
    var gainImg = wEnd.and(wStart.not()).selfMask().clip(roi);

    mapPanel.addLayer(lossImg, { palette: [LOSS_COLOR] },
        'Water LOSS (' + yStart + ' to ' + yEnd + ')', true);
    mapPanel.addLayer(gainImg, { palette: [GAIN_COLOR] },
        'Water GAIN (' + yStart + ' to ' + yEnd + ')', true);

    var years = ee.List.sequence(yStart, yEnd);
    var MIN_VALID_PIXELS = 10;

    var areaFC = ee.FeatureCollection(
        years.map(function (y) {
            y = ee.Number(y).toInt();

            var img = jrcAll
                .filter(ee.Filter.calendarRange(y, y, 'year'))
                .first();

            var waterClassImg = ee.Image(ee.Algorithms.If(
                img,
                ee.Image(img).select('waterClass'),
                ee.Image.constant(0).rename('waterClass')
            ));

            var pxArea = ee.Image.pixelArea();
            var validBand     = waterClassImg.gt(0).multiply(pxArea).rename('valid_area');
            var permanentBand = waterClassImg.eq(3).multiply(pxArea).rename('permanent_area');
            var seasonalBand  = waterClassImg.eq(2).multiply(pxArea).rename('seasonal_area');
            var totalWaterBand = waterClassImg.gte(thresh).multiply(pxArea).rename('water_area');
            var landBand      = waterClassImg.eq(1).multiply(pxArea).rename('land_area');
            var noDataBand    = waterClassImg.eq(0).multiply(pxArea).rename('nodata_area');
            var validCount    = waterClassImg.gt(0).rename('valid_count');

            var composite = validCount
                .addBands(validBand)
                .addBands(permanentBand)
                .addBands(seasonalBand)
                .addBands(totalWaterBand)
                .addBands(landBand)
                .addBands(noDataBand);

            var stats = composite.reduceRegion({
                reducer: ee.Reducer.sum(),
                geometry: roi,
                scale: 100,
                maxPixels: 1e10,
                bestEffort: true,
                tileScale: 2
            });

            var validPixels   = ee.Number(stats.get('valid_count'));
            var waterM2       = ee.Number(stats.get('water_area'));
            var permM2        = ee.Number(stats.get('permanent_area'));
            var seasM2        = ee.Number(stats.get('seasonal_area'));
            var landM2        = ee.Number(stats.get('land_area'));
            var nodataM2      = ee.Number(stats.get('nodata_area'));
            var validM2       = ee.Number(stats.get('valid_area'));

            var hasData = validPixels.gte(MIN_VALID_PIXELS);

            var areaKm2 = ee.Algorithms.If(hasData, waterM2.divide(1e6), null);

            return ee.Feature(null, {
                year: y,
                area_km2: areaKm2,
                permanent_water_km2: ee.Algorithms.If(hasData, permM2.divide(1e6), null),
                seasonal_water_km2:  ee.Algorithms.If(hasData, seasM2.divide(1e6), null),
                land_km2:            ee.Algorithms.If(hasData, landM2.divide(1e6), null),
                nodata_km2:          ee.Algorithms.If(hasData, nodataM2.divide(1e6), null),
                classified_area_km2: ee.Algorithms.If(hasData, validM2.divide(1e6), null)
            });
        })
    );

    // Filter out years with no usable data before charting
    var chartFC = areaFC.filter(ee.Filter.notNull(['area_km2']));

    var chart = ui.Chart.feature.byFeature({
        features: chartFC,
        xProperty: 'year',
        yProperties: ['area_km2']
    })
        .setChartType('LineChart')
        .setOptions({
            title: name + ' - Surface Water Area ' + yStart + '-' + yEnd + (thresh === 3 ? ' (Permanent only)' : ' (Seasonal + Permanent)'),
            titleTextStyle: { fontSize: 13, bold: true, color: '#0F172A', fontName: 'Roboto' },
            hAxis: {
                title: 'Year',
                format: '####',
                gridlines: { count: 8, color: '#F1F5F9' },
                titleTextStyle: { fontSize: 12, color: '#64748B' },
                textStyle: { color: '#64748B' }
            },
            vAxis: {
                title: 'Area (km\u00B2)',
                minValue: 0,
                gridlines: { color: '#F1F5F9' },
                titleTextStyle: { fontSize: 12, color: '#64748B' },
                textStyle: { color: '#64748B' }
            },
            series: { 
                0: { color: '#0EA5E9', lineWidth: 3, pointSize: 5 }
            },
            legend: { position: 'none' },
            backgroundColor: '#FFFFFF',
            chartArea: { left: 55, top: 30, width: '85%', height: '70%' },
        });

    chartPanel.clear();
    chartPanel.add(chart);

    var summaryReduceOpts = {
        reducer: ee.Reducer.sum(),
        geometry: roi,
        scale: 100,
        maxPixels: 1e10,
        bestEffort: true,
        tileScale: 2
    };
    var startAreaM2 = wStart.multiply(ee.Image.pixelArea())
        .reduceRegion(summaryReduceOpts)
        .get('water');

    var endAreaM2 = wEnd.multiply(ee.Image.pixelArea())
        .reduceRegion(summaryReduceOpts)
        .get('water');

    var maxYear = ee.Algorithms.If(chartFC.size().gt(0), chartFC.sort('area_km2', false).first().get('year'), null);
    var maxKm2 = ee.Algorithms.If(chartFC.size().gt(0), chartFC.sort('area_km2', false).first().get('area_km2'), null);
    var minYear = ee.Algorithms.If(chartFC.size().gt(0), chartFC.sort('area_km2', true).first().get('year'), null);
    var minKm2 = ee.Algorithms.If(chartFC.size().gt(0), chartFC.sort('area_km2', true).first().get('area_km2'), null);

    ee.Dictionary({
        startKm2: ee.Number(startAreaM2).divide(1e6),
        endKm2: ee.Number(endAreaM2).divide(1e6),
        maxYear: maxYear,
        maxKm2: maxKm2,
        minYear: minYear,
        minKm2: minKm2
    }).evaluate(function (res, error) {
        runBtn.setDisabled(false);

        if (error) {
            statsPanel.clear();
            statsPanel.add(lbl('Server error: ' + error, { color: '#c00', fontSize: '11px' }));
            statusLbl.setValue('Computation failed.\n   Try a shorter date range.');
            statusPanel.style().set('border', '2px solid #cb181d');
            return;
        }

        statsPanel.clear();

        if (!res || res.startKm2 === undefined || res.endKm2 === undefined) {
            statsPanel.add(lbl('Could not retrieve statistics (empty ROI or error).', { color: '#c00' }));
            statusLbl.setValue('Done with warnings.\n   Check console or widen the date range.');
            return;
        }

        var startK = Number(res.startKm2);
        var endK = Number(res.endKm2);
        var deltaK = endK - startK;

        var s = startK.toFixed(2);
        var e = endK.toFixed(2);
        var d = deltaK.toFixed(2);
        var sign = deltaK >= 0 ? '+' : '';

        var pctStr;
        var pctNum;
        if (startK <= 1e-6) {
            pctStr = 'N/A (no water detected at start year)';
            pctNum = null;
        } else {
            pctNum = (deltaK / startK) * 100;
            pctStr = (pctNum >= 0 ? '+' : '') + pctNum.toFixed(1) + ' %';
        }

        var riskLabel;
        var riskColor;
        var riskIcon;
        if (pctNum === null) {
            riskLabel = 'Risk N/A';
            riskColor = '#555';
            riskIcon = '[N/A]';
        } else if (pctNum > -10) {
            riskLabel = 'Stable / Recovering';
            riskColor = '#41ab5d';
            riskIcon = '[STABLE]';
        } else if (pctNum >= -30) {
            riskLabel = 'Moderate loss';
            riskColor = '#fe9929';
            riskIcon = '[WARNING]';
        } else {
            riskLabel = 'Severe loss';
            riskColor = '#cb181d';
            riskIcon = '[CRITICAL]';
        }

        statsPanel.add(lbl('Summary Results: ' + name + (thresh === 3 ? ' (Permanent only)' : ''), {
            fontWeight: 'bold', fontSize: '14px', color: '#0F172A', margin: '0 0 12px 0'
        }));
        statsPanel.add(resultRow('Water area in ' + yStart + ' (km²):', s + ' km²'));
        statsPanel.add(resultRow('Water area in ' + yEnd + ' (km²):', e + ' km²'));
        statsPanel.add(resultRow(
            'Net change (km²):',
            sign + d + ' km²',
            riskColor
        ));
        statsPanel.add(resultRow(
            'Change vs start:',
            pctStr,
            riskColor
        ));
        
        if (res.maxKm2 !== null && res.maxYear !== null) {
            statsPanel.add(ui.Panel({ style: { height: '1px', backgroundColor: '#E2E8F0', margin: '6px 0' } }));
            statsPanel.add(resultRow('Largest recorded extent:', Number(res.maxKm2).toFixed(2) + ' km² in ' + res.maxYear));
            statsPanel.add(resultRow('Smallest recorded extent:', Number(res.minKm2).toFixed(2) + ' km² in ' + res.minYear));
        }

        statsPanel.add(ui.Panel({ style: { height: '1px', backgroundColor: '#E2E8F0', margin: '8px 0' } }));
        
        // Risk Badge
        statsPanel.add(ui.Panel([
            lbl(riskIcon, { margin: '2px 6px 0 0', fontSize: '14px' }),
            lbl(riskLabel, {
                fontWeight: 'bold', color: '#fff', fontSize: '12px',
                backgroundColor: riskColor, padding: '2px 8px'
            })
        ], ui.Panel.Layout.flow('horizontal'), {backgroundColor: '#FFFFFF'}));

        statsPanel.add(lbl(
            'Data quality note: Water area estimated from 30-metre Landsat ' +
            'satellite imagery (JRC Global Surface Water, v1.4). Results are ' +
            'accurate to approximately ±1 km² for large water bodies. ' +
            'Monsoon-season cloud cover may cause underestimation. ' +
            'Gaps in chart indicate years with insufficient satellite coverage.',
            { fontSize: '10px', color: '#666', fontStyle: 'italic', margin: '15px 0 0 0', backgroundColor: '#FFFFFF' }
        ));

        var exportBtn = ui.Button({
            label: '⬇ Export Data as CSV',
            style: {
                width: '220px', color: '#16A34A', fontWeight: 'bold',
                margin: '14px 0 4px 0'
            }
        });
        var exportStatusLbl = lbl('', { fontSize: '10px', color: '#64748B', margin: '0 0 8px 0', backgroundColor: '#FFFFFF' });

        exportBtn.onClick(function () {
            exportBtn.setDisabled(true);
            exportStatusLbl.setValue('Preparing CSV, computing per-year breakdown...');

            var startArea = ee.Number(startK);

            var exportReady = chartFC.map(function (f) {
                var yr = ee.Number(f.get('year'));
                var totalW = ee.Number(f.get('area_km2'));
                var permW  = ee.Number(f.get('permanent_water_km2'));
                var seasW  = ee.Number(f.get('seasonal_water_km2'));
                var landA  = ee.Number(f.get('land_km2'));
                var nodA   = ee.Number(f.get('nodata_km2'));
                var clsA   = ee.Number(f.get('classified_area_km2'));

                var chgFromStart = totalW.subtract(startArea);
                var pctFromStart = ee.Algorithms.If(
                    startArea.gt(1e-6),
                    chgFromStart.divide(startArea).multiply(100),
                    ee.Number(0)
                );

                var waterPct = ee.Algorithms.If(
                    clsA.gt(1e-6),
                    totalW.divide(clsA).multiply(100),
                    ee.Number(0)
                );

                return ee.Feature(null, {
                    water_body: name,
                    year: yr,
                    total_water_km2: totalW,
                    permanent_water_km2: permW,
                    seasonal_water_km2: seasW,
                    land_km2: landA,
                    nodata_km2: nodA,
                    classified_area_km2: clsA,
                    water_pct_of_classified: waterPct,
                    change_from_start_km2: chgFromStart,
                    change_from_start_pct: pctFromStart,
                    start_year: ee.Number(yStart),
                    end_year: ee.Number(yEnd),
                    water_type_filter: thresh === 3 ? 'permanent_only' : 'seasonal_and_permanent',
                    roi_type: roiType,
                    data_source: 'JRC/GSW1_4/YearlyHistory'
                });
            });

            var colOrder = [
                'water_body', 'year',
                'total_water_km2', 'permanent_water_km2', 'seasonal_water_km2',
                'land_km2', 'nodata_km2', 'classified_area_km2',
                'water_pct_of_classified',
                'change_from_start_km2', 'change_from_start_pct',
                'start_year', 'end_year',
                'water_type_filter', 'roi_type', 'data_source'
            ];

            exportReady.getDownloadURL(
              'CSV',
              colOrder,
              'SWaHM_' + name.replace(/[^a-zA-Z0-9]/g, '_') + '_' + yStart + '_' + yEnd,
              function (url, dlError) {
                exportBtn.setDisabled(false);
                if (dlError) {
                    exportStatusLbl.setValue('Export failed: ' + dlError);
                    return;
                }
                exportStatusLbl.setValue('');
                var downloadLink = ui.Label({
                    value: '📥 Click here to download CSV',
                    style: {
                        fontSize: '12px', color: '#0284C7', fontWeight: 'bold',
                        margin: '2px 0 8px 0', backgroundColor: '#FFFFFF'
                    },
                    targetUrl: url
                });
                statsPanel.add(downloadLink);
            });
        });

        statsPanel.add(exportBtn);
        statsPanel.add(exportStatusLbl);

        insightPanel.clear();
        insightPanel.add(lbl('Trend Analysis', {
            fontWeight: 'bold', fontSize: '14px', color: '#92400E',
            margin: '0 0 10px 0', backgroundColor: '#FFFBEB'
        }));

        var ctx = WATER_BODY_CONTEXT[name] || { type: 'water body', significance: '' };
        var span = yEnd - yStart;
        var annualRate = span > 0 ? deltaK / span : 0;

        var trendWord, trendDetail;
        if (pctNum === null) {
            trendWord = 'cannot be measured';
            trendDetail = 'There was no water at the start of this time period. ' +
                'We cannot calculate a percentage change.';
        } else if (pctNum > 10) {
            trendWord = 'significant growth';
            trendDetail = 'Water area increased by ' + Math.abs(pctNum).toFixed(1) +
                '%, gaining ' + Math.abs(deltaK).toFixed(1) + ' km² over ' +
                span + ' years (approx. ' + Math.abs(annualRate).toFixed(2) + ' km²/year).';
        } else if (pctNum > 2) {
            trendWord = 'modest growth';
            trendDetail = 'Water area increased by ' + pctNum.toFixed(1) +
                '%, gaining ' + deltaK.toFixed(1) + ' km² over ' + span + ' years.';
        } else if (pctNum >= -2) {
            trendWord = 'relative stability';
            trendDetail = 'Net change is within ±2% (' + sign + Math.abs(pctNum).toFixed(1) +
                '%) over ' + span + ' years, indicating no statistically significant trend.';
        } else if (pctNum >= -10) {
            trendWord = 'small decrease';
            trendDetail = 'Water area declined by ' + Math.abs(pctNum).toFixed(1) +
                '%, losing ' + Math.abs(deltaK).toFixed(1) + ' km² over ' + span + ' years.';
        } else if (pctNum >= -30) {
            trendWord = 'moderate loss';
            trendDetail = 'Water area declined by ' + Math.abs(pctNum).toFixed(1) +
                '%, losing ' + Math.abs(deltaK).toFixed(1) + ' km² over ' + span +
                ' years (approx. ' + Math.abs(annualRate).toFixed(2) + ' km²/year).';
        } else {
            trendWord = 'severe loss';
            trendDetail = 'Water area declined by ' + Math.abs(pctNum).toFixed(1) +
                '%, losing ' + Math.abs(deltaK).toFixed(1) + ' km² over ' + span +
                ' years (approx. ' + Math.abs(annualRate).toFixed(2) + ' km²/year, a severe long-term loss).';
        }

        var para1 = name + ', a ' + ctx.type;
        var waterTypeNote = thresh === 3
          ? 'Only permanently inundated pixels are counted in this analysis.'
          : 'Both seasonal and permanent water pixels are counted in this analysis.';
        if (ctx.significance) {
            para1 += ' (' + ctx.significance + ')';
        }
        para1 += ' shows ' + trendWord + ' over the ' + span + '-year study period ' +
            '(' + yStart + ' to ' + yEnd + '). ' + trendDetail + ' ' + waterTypeNote;

        insightPanel.add(lbl(para1, {
            fontSize: '12px', color: '#78350F', margin: '0 0 10px 0',
            whiteSpace: 'pre-wrap', backgroundColor: '#FFFBEB'
        }));

        var para2 = '';
        if (res.maxKm2 !== null && res.minKm2 !== null) {
            para2 = 'The largest area seen was ' + Number(res.maxKm2).toFixed(1) +
                ' square kilometers in ' + res.maxYear;
            if (KNOWN_FLOOD_YEARS[res.maxYear]) {
                para2 += '. This was during the ' + KNOWN_FLOOD_YEARS[res.maxYear];
            }
            para2 += '. The smallest area seen was ' + Number(res.minKm2).toFixed(1) +
                ' square kilometers in ' + res.minYear;
            
            if (Number(res.minKm2) < endK * 0.5) {
                para2 += ', representing less than half the current recorded extent';
            }
            para2 += '.';

            var rangeKm2 = Number(res.maxKm2) - Number(res.minKm2);
            if (rangeKm2 > endK * 1.5 && endK > 0) {
                para2 += ' High inter-annual variability suggests strong flood-drought cycles.';
            }
        }
        if (para2) {
            insightPanel.add(lbl(para2, {
                fontSize: '12px', color: '#78350F', margin: '0 0 10px 0',
                whiteSpace: 'pre-wrap', backgroundColor: '#FFFBEB'
            }));
        }

        var riskNarrative;
        if (pctNum === null) {
            riskNarrative = 'Risk cannot be calculated because there was no water in ' + yStart + '.';
        } else if (pctNum > -10) {
            riskNarrative = 'LOW RISK: ' + name + ' shows a stable or recovering trend within the selected period.';
        } else if (pctNum >= -30) {
            riskNarrative = 'MODERATE RISK: ' + name + ' shows a measurable decline in surface water extent. Upstream extraction, canal diversions, or sedimentation may be contributing factors.';
        } else {
            riskNarrative = 'HIGH RISK: ' + name + ' has lost more than 30% of its recorded surface water extent. Immediate investigation and intervention are recommended.';
        }
        insightPanel.add(lbl(riskNarrative, {
            fontSize: '12px', color: '#78350F', fontWeight: 'bold',
            margin: '0 0 10px 0', whiteSpace: 'pre-wrap', backgroundColor: '#FFFBEB'
        }));

        var recs = ['Recommended Actions:'];
        if (pctNum !== null && pctNum < -10) {
            recs.push('• Commission a ground-truth survey to verify satellite-derived trends at ' + name);
            recs.push('• Review upstream water extraction and canal diversion practices');
        }
        if (ctx.type === 'lake') {
            recs.push('• Assess sedimentation rates which may be reducing ' + ctx.type + ' capacity');
        }
        if (ctx.type === 'barrage') {
            recs.push('• Coordinate with IRSA to review seasonal flow allocation from upstream barrages');
        }
        if (ctx.type === 'reservoir') {
            recs.push('• Evaluate dam maintenance and storage capacity trends');
        }
        if (pctNum !== null && pctNum < -30) {
            recs.push('• Escalate to provincial Water Resources Department for priority intervention');
            recs.push('• Include in next Provincial Disaster Risk Management Plan update');
        }
        recs.push('• Schedule follow-up analysis after next monsoon season for comparison');
        recs.push('• Share this report with relevant district Deputy Commissioner\'s office');

        insightPanel.add(lbl(recs.join('\n'), {
            fontSize: '11px', color: '#92400E', whiteSpace: 'pre-wrap',
            margin: '0', backgroundColor: '#FFFBEB'
        }));

        insightPanel.add(lbl(
            '\nNote: Results are derived from 30-metre Landsat satellite imagery (JRC Global Surface Water v1.4).' +
            ' Field verification is recommended before operational decision-making.',
            { fontSize: '9px', color: '#B45309', fontStyle: 'italic',
              whiteSpace: 'pre-wrap', backgroundColor: '#FFFBEB' }
        ));

        var rangeNote = yearSpan < 5
            ? '\n   Note: Short ranges are not very reliable. Use 10+ years for better results.'
            : '';
        statusLbl.setValue(
            'Done\n   ' + name + ' · ' + yStart + ' - ' + yEnd + '\n   ROI: ' + roiType + rangeNote
        );
        statusPanel.style().set('border', '2px solid #10B981');

    });

});

