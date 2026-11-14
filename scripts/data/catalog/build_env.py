"""Build data/mars/catalog/environment.json from downloaded NASA/PDS files."""
import csv, glob, json, os, sys, datetime

RAW, OUT = sys.argv[1], sys.argv[2]


def load(n):
    with open(os.path.join(RAW, n), encoding="utf-8") as f:
        return json.load(f)


WP = [f["properties"] for f in load("M20_Layers_json_M20_waypoints.json")["features"]]
MWP = [f["properties"] for f in load("MSL_Layers_json_MSL_waypoints.json")["features"]]


def at_or_before(wps, sol):
    best = None
    for p in wps:
        if p["sol"] <= sol:
            best = p
    return best


def raw_dates(sol):
    d = load(f"raw/m20_{sol}.json")
    return sorted(set(i["date_taken_utc"][:10] for i in d["images"]))


OBS, EXC = [], []
MEDA_PDS = {"title": "Mars 2020 MEDA calibrated environmental data (PDS Atmospheres Node), sol {s} files WE__{s4}___________CAL_ATS / CAL_PS",
            "url": "https://atmos.nmsu.edu/PDS/data/PDS4/Mars2020/mars2020_meda/data_calibrated_env/sol_0420_0539/sol_{s4}/"}
W = next(p for p in WP if p["RMC"] == "26_1222")

# ---- MEDA at Wildcat Ridge, computed from PDS calibrated files
for s in (502, 504, 509, 516):
    s4 = f"{s:04d}"
    dates = raw_dates(s)
    base_loc = {"lat": W["lat"], "lon": W["lon"], "precision": "precise",
                "note": "Rover at waypoint 26_1222 (sols 502-534); raw images for this sol are tagged site 26 drive 1222."}
    src = {"title": MEDA_PDS["title"].format(s=s, s4=s4), "url": MEDA_PDS["url"].format(s4=s4)}
    # air temperature: mean of the three mast (RSM) ATS sensors at each sample
    f = glob.glob(f"{RAW}/meda2/WE__{s4}*CAL_ATS*.CSV")[0]
    vals = []
    for row in csv.DictReader(open(f)):
        try:
            v = [float(row[f"ATS_LOCAL_TEMP{i}"]) for i in (1, 2, 3)]
        except (ValueError, KeyError):
            continue
        vals.append((sum(v) / 3, row["LMST"][6:14]))
    lo, hi = min(vals), max(vals)
    OBS.append({
        "id": f"meda-sol{s}-air-temperature", "kind": "air-temperature",
        "measures": "Air temperature near the rover's mast (MEDA ATS sensors 1-3, mounted on the remote sensing mast), daily minimum and maximum of the three-sensor mean",
        "min": round(lo[0], 1), "max": round(hi[0], 1), "unit": "K",
        "minC": round(lo[0] - 273.15, 1), "maxC": round(hi[0] - 273.15, 1),
        "sol": s, "date": dates[0], "dateNote": f"Sol {s} spans {', '.join(dates)} UTC (raw image feed).",
        "localTime": f"min at LMST {lo[1]}, max at LMST {hi[1]}",
        "samples": len(vals),
        "derivation": "Computed here from the calibrated PDS CSV (no smoothing). MEDA does not sample continuously, so the true extremes can fall between samples; the sensors sit near the rover and can be affected by its heat.",
        "location": base_loc, "instrument": "MEDA (Mars Environmental Dynamics Analyzer) ATS", "mission": "Mars 2020 Perseverance",
        "source": src,
    })
    f = glob.glob(f"{RAW}/meda2/WE__{s4}*CAL_PS*.CSV")[0]
    vals, tr = [], set()
    for row in csv.DictReader(open(f)):
        tr.add(row["TRANSDUCER"])
        try:
            vals.append((float(row["BAROCAP1_PRESSURE"]), row["LMST"][6:14]))
        except ValueError:
            pass
    lo, hi = min(vals), max(vals)
    OBS.append({
        "id": f"meda-sol{s}-pressure", "kind": "pressure",
        "measures": "Surface air pressure (MEDA pressure sensor, BAROCAP1 column), daily minimum and maximum",
        "min": round(lo[0], 1), "max": round(hi[0], 1), "unit": "Pa",
        "sol": s, "date": dates[0], "dateNote": f"Sol {s} spans {', '.join(dates)} UTC (raw image feed).",
        "localTime": f"min at LMST {lo[1]}, max at LMST {hi[1]}",
        "samples": len(vals),
        "derivation": f"Computed here from the calibrated PDS CSV; measurement mode nominal, transducer {', '.join(sorted(tr))}. BAROCAP1 reads about 10 Pa above BAROCAP2/3 in the same file; the label does not state which is preferred.",
        "location": base_loc, "instrument": "MEDA PS (pressure sensor)", "mission": "Mars 2020 Perseverance",
        "source": src,
    })

# ---- MEDA outreach feed (only a few recent sols)
feed = load("w_mars2020.json")["sols"]
for x in feed:
    if x["min_temp"] == "--" and x["pressure"] == "--":
        continue
    s = int(x["sol"])
    w = at_or_before(WP, s)
    loc = {"lat": w["lat"], "lon": w["lon"], "precision": "approximate",
           "note": f"Rover waypoint {w['RMC']} (sol {w['sol']}), the last localization at or before sol {s}."}
    srcf = {"title": "NASA Perseverance MEDA weather feed", "url": "https://mars.nasa.gov/rss/api/?feed=weather&category=mars2020&feedtype=json"}
    if x["min_temp"] != "--":
        OBS.append({"id": f"meda-feed-sol{s}-air-temperature", "kind": "air-temperature",
                    "measures": "Daily minimum and maximum air temperature (NASA MEDA weather feed)",
                    "min": x["min_temp"], "max": x["max_temp"], "unit": "°C", "sol": s, "date": x["terrestrial_date"],
                    "localTime": None, "location": loc, "instrument": "MEDA", "mission": "Mars 2020 Perseverance", "source": srcf})
    if x["pressure"] != "--":
        OBS.append({"id": f"meda-feed-sol{s}-pressure", "kind": "pressure",
                    "measures": "Daily pressure value (NASA MEDA weather feed)", "value": x["pressure"], "unit": "Pa",
                    "sol": s, "date": x["terrestrial_date"], "localTime": None, "location": loc, "instrument": "MEDA",
                    "mission": "Mars 2020 Perseverance", "source": srcf})

# ---- Curiosity REMS feed at catalog event sols
REMS = {int(x["sol"]): x for x in load("w_msl.json")["soles"]}
remsrc = {"title": "Curiosity REMS weather feed (Centro de Astrobiologia via mars.nasa.gov; outreach data, scientific data are in the PDS)",
          "url": "https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json"}
for s, why in [(16, "first drive"), (182, "John Klein drilling"), (759, "Confidence Hills drilling"), (2407, "proposed-path publication date"),
               (4200, "sulfur discovery"), (4995, "latest sol in the feed")]:
    x = REMS[s]
    w = at_or_before(MWP, s)
    loc = {"lat": w["lat"], "lon": w["lon"], "precision": "approximate",
           "note": f"Rover waypoint {w['RMC']} (sol {w['sol']}), the last localization at or before sol {s}. Linked to catalog event: {why}."}
    for kind, a, b, unit, meas in [("air-temperature", "min_temp", "max_temp", "°C", "Daily minimum and maximum air temperature at the REMS booms"),
                                   ("ground-temperature", "min_gts_temp", "max_gts_temp", "°C", "Daily minimum and maximum ground temperature (REMS ground temperature sensor)")]:
        if x[a] == "--":
            continue
        OBS.append({"id": f"rems-sol{s}-{kind}", "kind": kind, "measures": meas, "min": float(x[a]), "max": float(x[b]), "unit": unit,
                    "sol": s, "date": x["terrestrial_date"], "localTime": None, "location": loc, "instrument": "REMS",
                    "mission": "Mars Science Laboratory Curiosity", "source": remsrc})
    if x["pressure"] != "--":
        OBS.append({"id": f"rems-sol{s}-pressure", "kind": "pressure", "measures": "Daily pressure value (REMS)", "value": float(x["pressure"]),
                    "unit": "Pa", "sol": s, "date": x["terrestrial_date"], "localTime": None, "location": loc, "instrument": "REMS",
                    "mission": "Mars Science Laboratory Curiosity", "source": remsrc})

# ---- RAD as published by NASA
L = MWP[0]
OBS.append({
    "id": "rad-gale-first-10-months-dose-rate", "kind": "radiation-dose",
    "measures": "Absorbed radiation dose rate at the surface, almost entirely from galactic cosmic rays",
    "value": 210, "unit": "µGy/day", "approximate": True,
    "sol": None, "date": None, "period": {"start": "2012-08", "end": "2013-06", "note": "Curiosity's first 10 months on Mars, as plotted by NASA"},
    "localTime": None,
    "location": {"lat": L["lat"], "lon": L["lon"], "precision": "regional",
                 "note": "Gale Crater. Over this period Curiosity drove from Bradbury Landing to Yellowknife Bay; the point shown is the landing site."},
    "instrument": "RAD (Radiation Assessment Detector)", "mission": "Mars Science Laboratory Curiosity",
    "detail": "NASA: 'a slowly varying dose rate of about 210 micrograys per day'; Forbush decreases on sols 50, 97, 208 and 259; only one weak solar particle event observed on the surface in that period.",
    "source": {"title": "NASA: Radiation Measurements on Mars (Dec. 9, 2013)", "url": "https://science.nasa.gov/resource/radiation-measurements-on-mars/"},
})

# ---- InSight (frozen feed, at the lander)
ins = load("w_insight_temperature.json")
inssrc = {"title": "NASA InSight weather feed (data end at sol 681, Oct 2020)", "url": "https://mars.nasa.gov/rss/api/?feed=weather&category=insight_temperature&feedtype=json&ver=1.0"}
iloc = {"lat": 4.50, "lon": 135.62, "precision": "approximate", "note": "InSight landing site (GISS Mars24); see insight-landing in events.json."}
for k in ins["sol_keys"]:
    x = ins[k]
    vc = ins.get("validity_checks", {}).get(k, {})
    for code, kind, unit, meas in [("AT", "air-temperature", "°C", "Air temperature, sol minimum and maximum (InSight TWINS)"),
                                   ("PRE", "pressure", "Pa", "Atmospheric pressure, sol minimum and maximum (InSight PS)"),
                                   ("HWS", "wind", "m/s", "Horizontal wind speed, sol minimum and maximum (InSight TWINS)")]:
        if code not in x or not vc.get(code, {}).get("valid", False):
            continue
        OBS.append({"id": f"insight-sol{k}-{kind}", "kind": kind, "measures": meas, "min": x[code]["mn"], "max": x[code]["mx"],
                    "mean": x[code]["av"], "unit": unit, "sol": int(k), "date": x["First_UTC"][:10],
                    "localTime": f"UTC {x['First_UTC']} to {x['Last_UTC']}", "location": iloc,
                    "instrument": "InSight APSS (TWINS, PS)", "mission": "InSight", "source": inssrc})

EXC += [
    {"what": "MEDA weather feed for Wildcat Ridge sols 490-540", "reason": "The NASA MEDA feed only returns 7 recent sols (1127-1133, April 2024). Wildcat Ridge values were computed instead from PDS calibrated files for sols 502, 504, 509 and 516."},
    {"what": "MEDA ground temperature at Wildcat Ridge", "reason": "The PDS derived TIRS product gives up/down longwave irradiance, not a ground temperature; converting it would need an emissivity assumption, so no value is given."},
    {"what": "MEDA wind, humidity and dust opacity at Wildcat Ridge", "reason": "Not processed: wind sensor and RDS/SkyCam retrievals need calibration choices documented in the MEDA SIS; no NASA-published values for these sols were found."},
    {"what": "REMS wind, humidity, UV index and 'atmo_opacity'", "reason": "The REMS feed reports wind and humidity as '--' for the selected sols; 'atmo_opacity' is a qualitative word ('Sunny') and UV is a category, not a measured value."},
    {"what": "RAD time series from PDS (MSL-M-RAD-3-RDR-V1.0)", "reason": "The PDS PPI bundle exists (HTTP 200) but its RDR files were not downloaded or reduced; only NASA's published dose rate is included."},
    {"what": "RAD dose in sieverts (dose equivalent)", "reason": "No NASA page fetched in this session gives a dated, located surface dose-equivalent value."},
]

out = {"generatedAt": datetime.date.today().isoformat(),
       "convention": "planetocentric latitude, east longitude -180..180",
       "observations": OBS, "excluded": EXC}
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(out, f, indent=2, ensure_ascii=False)
    f.write("\n")
print(len(OBS), "observations;", len(EXC), "excluded")
