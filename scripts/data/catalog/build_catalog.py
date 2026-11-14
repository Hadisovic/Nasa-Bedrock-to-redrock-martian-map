"""Build data/mars/catalog/events.json from downloaded NASA files (a local raw-download directory)."""
import json, math, re, sys, datetime, os

RAW = sys.argv[1]
OUT = sys.argv[2]
R_MARS = 3396190.0


def load(name):
    with open(os.path.join(RAW, name), encoding="utf-8") as f:
        return json.load(f)


def dist_m(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R_MARS * math.asin(math.sqrt(a))


def lon180(lon):
    lon = ((lon + 180.0) % 360.0) - 180.0
    return round(lon, 8)


# ---------------------------------------------------------------- sources
SRC = {}


def src(sid, title, url):
    SRC[sid] = {"id": sid, "title": title, "url": url}
    return sid


MM = "https://mars.nasa.gov/mmgis-maps/"
src("m20-mmgis-config", "NASA Perseverance location map (MMGIS) layer configuration", "https://mars.nasa.gov/maps/location/api/configure/get?mission=M20")
src("msl-mmgis-config", "NASA Curiosity location map (MMGIS) layer configuration", "https://mars.nasa.gov/maps/location/api/configure/get?mission=MSL")
src("m20-mmgis-waypoints", "NASA Perseverance rover waypoints (MMGIS)", MM + "M20/Layers/json/M20_waypoints.json")
src("m20-mmgis-current", "NASA Perseverance current rover position (MMGIS)", MM + "M20/Layers/json/M20_waypoints_current.json")
src("m20-mmgis-samples", "NASA Perseverance sampling locations (MMGIS layer M20_SAMPLE_v3)", MM + "M20/Layers/json/M20_SAMPLE_v3.json")
src("m20-mmgis-depot", "NASA Perseverance sample depot zone (MMGIS layer M20_TF_Sample_Depot)", MM + "M20/Layers/json/M20_TF_Sample_Depot.json")
src("m20-mmgis-surface-sites", "NASA Perseverance surface view sites (MMGIS)", MM + "M20/Layers/json/M20_surfaceexperience.json")
src("m20-mmgis-heli-waypoints", "NASA Ingenuity helicopter waypoints (MMGIS)", MM + "M20/Layers/json/m20_heli_waypoints.json")
src("m20-mmgis-heli-path", "NASA Ingenuity helicopter flight paths (MMGIS)", MM + "M20/Layers/json/m20_heli_flight_path.json")
src("msl-mmgis-waypoints", "NASA Curiosity rover waypoints (MMGIS)", MM + "MSL/Layers/json/MSL_waypoints.json")
src("msl-mmgis-current", "NASA Curiosity current rover position (MMGIS)", MM + "MSL/Layers/json/MSL_waypoints_current.json")
src("msl-mmgis-surface-sites", "NASA Curiosity surface view sites (MMGIS)", MM + "MSL/Layers/json/MSL_SurfaceSites.json")
src("m20-raw-images", "NASA Perseverance raw images feed (sol to UTC date and site/drive)", "https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json")
src("nasa-mars-rock-samples", "NASA: Mars Rock Samples (Perseverance)", "https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples/")
src("nasa-hazeltop-bearwallow", "NASA: Meet the Mars Samples: Hazeltop and Bearwallow (Samples 12 and 13)", "https://science.nasa.gov/resource/meet-the-mars-samples-hazeltop-and-bearwallow-samples-12-and-13/")
src("nasa-three-forks-map", "NASA: Perseverance's 'Three Forks' Sample Depot Map", "https://science.nasa.gov/resource/perseverances-three-forks-sample-depot-map/")
src("nasa-wildcat-ridge", "NASA: Sample Collection and Rock Analysis at 'Wildcat Ridge'", "https://science.nasa.gov/resource/sample-collection-and-rock-analysis-at-wildcat-ridge/")
src("project-sites-ts", "Project file src/data/sites.ts and data/mars/jezero/sources.json (previously verified Wildcat Ridge facts)", "src/data/sites.ts")
src("jones-2025-pixl", "Jones et al. (2025), Science Advances, PIXL at Berry Hollow (open access; data in NASA PDS)", "https://pmc.ncbi.nlm.nih.gov/articles/PMC12002120/")
src("pds-pixl", "PIXL data in the NASA Planetary Data System", "https://doi.org/10.17189/1522645")
src("nasa-biosignature", "NASA: NASA Says Mars Rover Discovered Potential Biosignature Last Year (Sep 10, 2025)", "https://www.nasa.gov/news-release/nasa-says-mars-rover-discovered-potential-biosignature-last-year/")
src("nasa-backshell", "NASA: Rover's Backshell Seen From the Air", "https://science.nasa.gov/resource/rovers-backshell-seen-from-the-air/")
src("nasa-debris-field", "NASA: Debris Field From Perseverance Landing Gear Seen by Mars Helicopter", "https://science.nasa.gov/resource/debris-field-from-perseverance-landing-gear-seen-by-mars-helicopter/")
src("jpl-heli-gear", "JPL: NASA's Mars Helicopter Spots Gear That Helped Perseverance Rover Land", "https://www.jpl.nasa.gov/news/nasas-mars-helicopter-spots-gear-that-helped-perseverance-rover-land/")
src("nasa-msl-proposed-path", "NASA: Curiosity's Proposed Path up Mount Sharp", "https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/")
src("jpl-john-klein", "JPL: NASA Curiosity Rover Collects First Martian Bedrock Sample", "https://www.jpl.nasa.gov/news/nasa-curiosity-rover-collects-first-martian-bedrock-sample/")
src("nasa-msl-16-sites", "NASA Photojournal: Curiosity's First 16 Rock or Soil Sampling Sites on Mars", "https://science.nasa.gov/photojournal/curiositys-first-16-rock-or-soil-sampling-sites-on-mars/")
src("jpl-sulfur", "JPL: NASA's Curiosity Rover Discovers a Surprise in a Martian Rock (July 18, 2024)", "https://www.jpl.nasa.gov/news/nasas-curiosity-rover-discovers-a-surprise-in-a-martian-rock/")
src("msl-rems-feed", "NASA/CAB Curiosity REMS weather feed (sol to terrestrial date)", "https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json")
src("nasa-troy", "NASA Photojournal: Orbital View of Spirit at 'Troy' (PIA12205)", "https://science.nasa.gov/photojournal/orbital-view-of-spirit-at-troy/")
src("nasa-opp-final-map", "NASA Photojournal: Opportunity's Final Traverse Map", "https://science.nasa.gov/photojournal/opportunitys-final-traverse-map/")
src("nasa-opp-end", "NASA: NASA's Opportunity Rover Mission on Mars Comes to End", "https://science.nasa.gov/missions/mer/nasas-opportunity-rover-mission-on-mars-comes-to-end/")
src("giss-mars24-landers", "NASA GISS Mars24 Sunclock: Mars Lander Missions (updated 2023-12-09)", "https://www.giss.nasa.gov/tools/mars24/help/landers.html")
src("jpl-horizons-insight", "JPL Horizons spacecraft record -189 (InSight)", "https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND='-189'&OBJ_DATA='YES'&MAKE_EPHEM='NO'")
src("jpl-horizons-phoenix", "JPL Horizons spacecraft record -84 (Phoenix)", "https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND='-84'&OBJ_DATA='YES'&MAKE_EPHEM='NO'")
src("jpl-horizons-msl", "JPL Horizons spacecraft record -76 (MSL Curiosity)", "https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND='-76'&OBJ_DATA='YES'&MAKE_EPHEM='NO'")
NS = "https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id="
for sid, title, nid in [
    ("nssdca-viking1-lander", "NSSDCA: Viking 1 Lander", "1975-075C"),
    ("nssdca-viking2-lander", "NSSDCA: Viking 2 Lander", "1975-083C"),
    ("nssdca-pathfinder", "NSSDCA: Mars Pathfinder", "1996-068A"),
    ("nssdca-spirit", "NSSDCA: Spirit", "2003-027A"),
    ("nssdca-opportunity", "NSSDCA: Opportunity", "2003-032A"),
    ("nssdca-phoenix", "NSSDCA: Phoenix Mars Lander", "2007-034A"),
    ("nssdca-msl", "NSSDCA: Mars Science Laboratory (Curiosity)", "2011-070A"),
    ("nssdca-insight", "NSSDCA: InSight", "2018-042A"),
    ("nssdca-mars2020", "NSSDCA: Mars 2020 (Perseverance, Ingenuity)", "2020-052A"),
    ("nssdca-mpl", "NSSDCA: Mars Polar Lander", "1999-001A"),
]:
    src(sid, title, NS + nid)


def ev_url(sid):
    return {"title": SRC[sid]["title"], "url": SRC[sid]["url"]}


# ---------------------------------------------------------------- data
WP = [f["properties"] for f in load("M20_Layers_json_M20_waypoints.json")["features"]]
WPI = {p["RMC"]: p for p in WP}
MWP = [f["properties"] for f in load("MSL_Layers_json_MSL_waypoints.json")["features"]]
SAMPLES = [f["properties"] for f in load("M20_SAMPLE_v3.json")["features"]]
HELI = [f["properties"] for f in load("m20_heli_waypoints.json")["features"]]
HPATH = {f["properties"]["Flight"]: f["geometry"]["coordinates"] for f in load("m20_heli_flight_path.json")["features"]}
DEPOT = load("M20_TF_Sample_Depot.json")["features"][0]["geometry"]["coordinates"][0]
M20SURF = load("M20_surfaceexperience.json")["features"]
MSLSURF = load("MSL_SurfaceSites.json")["features"]
M20CUR = load("M20_waypoints_current.json")["features"][0]["properties"]
MSLCUR = load("MSL_waypoints_current.json")["features"][0]["properties"]
REMS = {int(x["sol"]): x for x in load("w_msl.json")["soles"]}


def raw_dates(sol):
    try:
        d = load(f"raw/m20_{sol}.json")
    except FileNotFoundError:
        return None
    ds = sorted(set(i["date_taken_utc"][:10] for i in d["images"]))
    sd = sorted(set(f"{i['site']}_{i['drive']}" for i in d["images"]))
    return ds, sd


def wp_at_or_before(wps, sol):
    best = None
    for p in wps:
        if p["sol"] <= sol:
            best = p
    return best


MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}


def parse_date(s):
    m = re.match(r"\s*([A-Za-z]+)\.?\s+(\d+),\s*(\d{4})", s)
    if not m:
        return None
    mon = MONTHS[m.group(1)[:3].lower()]
    return f"{int(m.group(3)):04d}-{mon:02d}-{int(m.group(2)):02d}"


def poly_centroid(coords):
    pts = coords[:-1] if coords[0] == coords[-1] else coords
    lon = sum(c[0] for c in pts) / len(pts)
    lat = sum(c[1] for c in pts) / len(pts)
    lats = [c[1] for c in pts]
    lons = [c[0] for c in pts]
    diag = dist_m(min(lats), min(lons), max(lats), max(lons))
    return round(lat, 8), round(lon, 8), diag


def loc(lat, lon, precision, unc, sid, note, footprint=None, title=None):
    assert -90 <= lat <= 90 and -180 <= lon <= 180, (lat, lon)
    return {
        "lat": round(lat, 8), "lon": round(lon, 8), "precision": precision,
        "uncertaintyM": unc, "footprintKm": footprint,
        "coordinateSource": {"title": title or SRC[sid]["title"], "url": SRC[sid]["url"], "note": note},
    }


EVENTS, UNLOC = [], []


def add(rec, unlocated=False):
    base = {"id": None, "title": None, "date": None, "sol": None, "mission": None, "missionId": None,
            "type": None, "observed": True, "summary": None, "found": None, "scientificValue": None,
            "region": None, "aliases": [], "location": None, "evidence": [], "media": [], "sourceIds": []}
    base.update(rec)
    for sid in base["sourceIds"]:
        assert sid in SRC, sid
    if unlocated:
        base["location"] = None
        assert base.get("reasonUnlocated")
        UNLOC.append(base)
    else:
        assert base["location"] is not None, base["id"]
        EVENTS.append(base)
    return base


M20 = ("Mars 2020 Perseverance", "m2020")
ING = ("Mars 2020 Ingenuity helicopter", "m2020-ingenuity")
MSL = ("Mars Science Laboratory Curiosity", "msl")
CREDIT = "NASA/JPL-Caltech"

# ================================================================ Perseverance
# Landing
p = WPI["3_0"]
add({
    "id": "m2020-landing", "title": "Perseverance lands in Jezero Crater", "date": "2021-02-18", "sol": 0,
    "mission": M20[0], "missionId": M20[1], "type": "landing",
    "summary": "Mars 2020 landed on 18 February 2021 at 20:55 UT (Earth received time) in Jezero Crater on the western edge of the Isidis Planitia impact basin, carrying the Ingenuity helicopter. NASA GISS lists the landing site as 'Octavia E. Butler Landing'.",
    "region": "Jezero Crater", "aliases": ["Octavia E. Butler Landing", "Mars 2020 landing site"],
    "location": loc(p["lat"], p["lon"], "precise", 10, "m20-mmgis-waypoints",
                    f"First point in the NASA waypoint feed, RMC 3_0 on sol {p['sol']}, noted 'Site increment, no motion'; the next point (3_110, sol 14) is the first drive. GISS Mars24 gives 77.45 E, 18.44 N, which agrees to its two decimals. Planetocentric, east longitude."),
    "evidence": [ev_url("nssdca-mars2020"), ev_url("giss-mars24-landers"), ev_url("m20-mmgis-waypoints")],
    "sourceIds": ["m20-mmgis-waypoints", "nssdca-mars2020", "giss-mars24-landers"],
})

# Surface view sites
for f in M20SURF:
    pr = f["properties"]
    lat, lon, diag = poly_centroid(f["geometry"]["coordinates"][0])
    s0 = int(str(pr["sols"]).split("-")[0])
    add({
        "id": "m2020-site-" + re.sub(r"[^a-z0-9]+", "-", pr["Name"].lower().replace("é", "e").replace("í", "i")).strip("-"),
        "title": f"Perseverance at {pr['Name']}", "date": None, "sol": s0,
        "mission": M20[0], "missionId": M20[1], "type": "rover-stop",
        "summary": f"NASA's Perseverance location map marks '{pr['Name']}' as a surface-view site for sols {pr['sols']} (site {pr['site']}, position {pr['pos']}).",
        "region": "Jezero Crater", "aliases": [pr["Name"], f"sols {pr['sols']}"],
        "location": loc(lat, lon, "approximate", round(diag / 2), "m20-mmgis-surface-sites",
                        f"Centroid of the NASA surface-view box ({diag:.0f} m corner to corner)."),
        "evidence": [ev_url("m20-mmgis-surface-sites")], "sourceIds": ["m20-mmgis-surface-sites"],
    })

# Wildcat Ridge sol 502 stop
p = WPI["26_1222"]
assert p["sol"] == 502 and p["lon"] == 77.40592495 and p["lat"] == 18.45864728
rd = raw_dates(502)
add({
    "id": "m2020-sol502-wildcat-ridge-stop", "title": "Perseverance parks at Wildcat Ridge", "date": "2022-07-19", "sol": 502,
    "mission": M20[0], "missionId": M20[1], "type": "rover-stop",
    "summary": "Perseverance ended its sol 502 drive at waypoint 26_1222 beside the Wildcat Ridge outcrop on the delta front and stayed there until its next drive on sol 535 (waypoint 26_1652).",
    "region": "Jezero Crater, delta front (Hawksbill Gap)", "aliases": ["Wildcat Ridge", "Waypoint 26_1222", "Hawksbill Gap"],
    "location": loc(p["lat"], p["lon"], "precise", 10, "m20-mmgis-waypoints",
                    f"Waypoint RMC 26_1222, sol 502, elevation {p['elev_geoid']} m (geoid). UTC date from the raw image feed ({', '.join(rd[0])}; images tagged site/drive {', '.join(rd[1])})."),
    "evidence": [ev_url("m20-mmgis-waypoints"), ev_url("m20-raw-images"), ev_url("nasa-wildcat-ridge")],
    "media": [{"url": "images/pov/sol502-navcam.jpg", "credit": CREDIT, "caption": "Navcam left, sol 502, image NLF_0502_0711506944_402ECM_N0261222NCAM00708_02_095J (existing project image)."}],
    "sourceIds": ["m20-mmgis-waypoints", "m20-raw-images", "project-sites-ts"],
})
rd = raw_dates(504)
add({
    "id": "m2020-sol504-berry-hollow-abrasion", "title": "Berry Hollow abrasion at Wildcat Ridge", "date": rd[0][0], "sol": 504,
    "dateNote": f"Sol 504 spans {' and '.join(rd[0])} UTC in the raw image feed.",
    "mission": M20[0], "missionId": M20[1], "type": "science-observation",
    "summary": "Perseverance abraded a circular patch, named Berry Hollow, in the Wildcat Ridge rock on sol 504 to investigate its composition; PIXL scanned it on sols 505 (BH1) and 507 (BH2). NASA gives the abrasion patch as about 5 cm (2 in) across.",
    "found": "PIXL identified calcium sulfate in the Berry Hollow vein: anhydrite with gypsum and bassanite. For the BH2 scan the study reports about 45% anhydrite, 37% gypsum and 18% bassanite among those phases. These values describe the centimetre-scale patch only.",
    "scientificValue": "NASA describes the delta as one of the best places on Mars to search for potential signs of ancient microbial life; sulfates like these precipitate from water and record how water moved through the delta sediments.",
    "region": "Jezero Crater, delta front (Hawksbill Gap)", "aliases": ["Berry Hollow", "BH1", "BH2", "Wildcat Ridge abrasion"],
    "location": loc(p["lat"], p["lon"], "precise", 10, "m20-mmgis-waypoints",
                    "Rover position at waypoint 26_1222 (sol 502); raw images from sol 504 are tagged site 26 drive 1222, so the rover had not moved. The patch is within arm's reach of this point; its exact offset is not published."),
    "evidence": [ev_url("nasa-wildcat-ridge"), ev_url("jones-2025-pixl"), ev_url("pds-pixl"), ev_url("m20-raw-images")],
    "media": [{"url": "images/pov/sol504-watson-abrasion.jpg", "credit": CREDIT, "caption": "SHERLOC WATSON, sol 504: the freshly abraded patch. Image SI1_0504_0711696755_871ECM_N0261222SRLC01034_0000LMJ (existing project image)."}],
    "sourceIds": ["m20-mmgis-waypoints", "m20-raw-images", "nasa-wildcat-ridge", "project-sites-ts", "jones-2025-pixl"],
})

# Samples
PAGE = {
 1: ("Roubion", "Roubion", "Atmospheric", 164, "Aug. 6, 2021", "n/a", "Sample Depot", "Polygon Valley"),
 2: ("Montdenier", "Rochette", "Rock Core", 194, "Sept. 6, 2021", "Igneous", "Sample Depot", "Artuby Ridge"),
 3: ("Montagnac", "Rochette", "Rock Core", 196, "Sept. 8, 2021", "Igneous", "Perseverance Rover", "Artuby Ridge"),
 4: ("Salette", "Brac", "Rock Core", 262, "Nov. 15, 2021", "Igneous", "Perseverance Rover", "South Séítah"),
 5: ("Coulettes", "Brac", "Rock Core", 271, "Nov. 24, 2021", "Igneous", "Sample Depot", "South Séítah"),
 6: ("Robine", "Issole", "Rock Core", 298, "Dec. 22, 2021", "Igneous", "Perseverance Rover", "South Séítah"),
 7: ("Malay", "Issole", "Rock Core", 337, "Jan. 31, 2022", "Igneous", "Sample Depot", "South Séítah"),
 8: ("Ha'ahóni", "Sid", "Rock Core", 371, "March 7, 2022", "Igneous", "Perseverance Rover", "Octavia E. Butler Landing / Ch'ał outcrop"),
 9: ("Atsá", "Sid", "Rock Core", 377, "March 13, 2022", "Igneous", "Sample Depot", "Octavia E. Butler Landing / Ch'ał outcrop"),
 10: ("Swift Run", "Skinner Ridge", "Rock Core", 490, "July 7, 2022", "Sedimentary", "Perseverance Rover", "Delta Front"),
 11: ("Skyland", "Skinner Ridge", "Rock Core", 495, "July 12, 2022", "Sedimentary", "Sample Depot", "Delta Front"),
 12: ("Hazeltop", "Wildcat Ridge", "Rock Core", 509, "July 27, 2022", "Sedimentary", "Perseverance Rover", "Delta Front"),
 13: ("Bearwallow", "Wildcat Ridge", "Rock Core", 516, "Aug. 3, 2022", "Sedimentary", "Sample Depot", "Delta Front"),
 14: ("Shuyak", "Amalik", "Rock Core", 575, "Oct. 2, 2022", "Sedimentary", "Perseverance Rover", "Delta Front"),
 15: ("Mageik", "Amalik", "Rock Core", 619, "Nov. 16, 2022", "Sedimentary", "Sample Depot", "Delta Front"),
 16: ("Kukaklek", "Hidden Harbor", "Rock Core", 631, "Nov. 29, 2022", "Sedimentary", "Perseverance Rover", "Delta Front"),
 17: ("Atmo Mountain", "Observation Mountain", "Regolith", 634, "Dec. 2, 2022", "Likely mixed sedimentary and igneous grains", "Perseverance Rover", "Delta Front"),
 18: ("Crosswind Lake", "Observation Mountain", "Regolith", 639, "Dec. 7, 2022", "Likely mixed sedimentary and igneous grains", "Sample Depot", "Delta Front"),
 19: ("Melyn", "Berea", "Rock Core", 749, "March 30, 2023", "Sedimentary", "Perseverance Rover", "Upper Fan"),
 20: ("Otis Peak", "Emerald Lake", "Rock Core", 832, "June 23, 2023", "Sedimentary", "Perseverance Rover", "Upper Fan"),
 21: ("Pilot Mountain", "Dream Lake", "Rock Core", 913, "Sept. 15, 2023", "Sedimentary", "Perseverance Rover", "Upper Fan"),
 22: ("Pelican Point", "Hans Amundsen Memorial Workspace", "Rock Core", 923, "Sept. 25, 2023", "Sedimentary", "Perseverance Rover", "Margin Unit"),
 23: ("Lefroy Bay", "Turquoise Bay", "Rock Core", 949, "Oct. 21, 2023", "Sedimentary", "Perseverance Rover", "Margin Unit"),
 24: ("Comet Geyser", "Bunsen Peak", "Rock Core", 1088, "March 12, 2024", "Silica-cemented Carbonate", "Perseverance Rover", "Margin Unit"),
 25: ("Sapphire Canyon", "Cheyava Falls", "Rock Core", 1215, "July 21, 2024", "Sedimentary", "Perseverance Rover", "Neretva Vallis"),
 26: ("Silver Mountain", "Shallow Bay", "Rock Core", 1401, "Jan. 28, 2025", "Igneous/impactite", "Perseverance Rover", "Crater Rim (Witch Hazel Hill)"),
 27: ("Green Gardens", "Tablelands", "Rock Core", 1433, "March 2, 2025", "Serpentinite", "Perseverance Rover", "Crater Rim (Witch Hazel Hill)"),
 28: ("Main River", "Broom Point", "Rock Core", 1441, "March 10, 2025", "Igneous/impactite", "Perseverance Rover", "Crater Rim (Witch Hazel Hill)"),
 29: ("Bell Island", "Pine Pond", "Rock Core", None, "TBD", "Igneous/impactite", "Perseverance Rover", "Crater Rim (Witch Hazel Hill)"),
 30: ("Gallants", "Salmon Point", "Rock Core", None, "TBD", "Igneous or sedimentary", "Perseverance Rover", "Crater Rim (Krokodillen)"),
}
# map each sample number to its MMGIS feature (pairs share a point)
MMS = {}
for s in SAMPLES:
    nums = [int(x) for x in re.findall(r"\d+", s["sample_num"])]
    sols = [x.strip() for x in str(s["sol"]).split("&")]
    for i, n in enumerate(nums):
        MMS[n] = (s, sols[i] if i < len(sols) else sols[-1])
assert sorted(MMS) == list(range(1, 31)), sorted(MMS)
DEPOT_NAMES = [PAGE[n][0] for n in PAGE if PAGE[n][6] == "Sample Depot"]

for n in range(1, 31):
    name, feature, stype, sol, date_s, rock, cur, area = PAGE[n]
    s, mm_sol = MMS[n]
    date = parse_date(date_s) if date_s != "TBD" else None
    notes = []
    if sol is None:
        notes.append(f"The NASA samples page lists the sol and date as TBD; the MMGIS sample layer gives sol {mm_sol} and date '{s['date']}'.")
        if mm_sol not in ("TBD", ""):
            sol = int(mm_sol)
            d2 = s["date"].split("&")[-1].strip()
            date = parse_date(d2)
    elif str(mm_sol) != str(sol):
        notes.append(f"The MMGIS sample layer gives sol {mm_sol} ('{s['date']}'); the NASA samples page value (sol {sol}, {date_s}) is used.")
    shared = [k for k in MMS if MMS[k][0] is s and k != n]
    prec, unc = "precise", 10
    lat, lon = s["lat"], s["lon"]
    if n == 23:
        prec, unc = "approximate", 100
        notes.append("The MMGIS layer gives Lefroy Bay exactly the same coordinates as Pelican Point (sample 22) but a different elevation, so the point is treated as approximate.")
    # cross-check with the rover waypoint at or before the sealing sol
    if sol is not None:
        w = wp_at_or_before(WP, sol)
        d = dist_m(lat, lon, w["lat"], w["lon"])
        notes.append(f"Cross-check: rover waypoint {w['RMC']} (sol {w['sol']}, last localization at or before sol {sol}) lies {d:.0f} m from this point.")
        if d > 20:
            notes.append("The NASA page sol is the sealing sol; the rover had driven on by then, so the MMGIS sampling point (not the rover position at sealing) is used.")
    note = (f"NASA MMGIS sampling-location point for sample(s) {s['sample_num']} ({s['sample_name']})"
            + (f", shared with sample {', '.join(map(str, shared))}" if shared else "") + ". " + " ".join(notes))
    rec = {
        "id": f"m2020-sample-{n:02d}-" + re.sub(r"[^a-z0-9]+", "-", name.lower().replace("ó", "o").replace("á", "a").replace("'", "")).strip("-"),
        "title": f"Sample {n}: {name}", "date": date, "sol": sol,
        "mission": M20[0], "missionId": M20[1], "type": "sample",
        "summary": f"{stype} sample No. {n}, '{name}', from feature '{feature}' ({area}); sealed on sol {sol if sol is not None else 'TBD'} ({date_s if date_s != 'TBD' else 'date TBD on the NASA page'}). Rock type: {rock}. Current location per NASA: {cur}.",
        "found": None, "scientificValue": None,
        "region": f"Jezero Crater, {area}", "aliases": [f"Sample {n}", name, feature],
        "location": loc(lat, lon, prec, unc, "m20-mmgis-samples", note),
        "evidence": [ev_url("nasa-mars-rock-samples"), ev_url("m20-mmgis-samples")],
        "sourceIds": ["nasa-mars-rock-samples", "m20-mmgis-samples"],
        "sampleType": stype, "rockType": rock, "currentLocation": cur,
    }
    if n == 8:
        rec["aliases"].append("Hahonih")
    if n == 9:
        rec["aliases"].append("Atsah")
    if n in (12, 13):
        rec["summary"] += " The pair is a fine-grained mudstone deposited in an ancient lake."
        rec["found"] = ("Hazeltop shows a small mineral vein inside the core and the team thinks it cored into a concretion." if n == 12
                        else "Bearwallow is the slightly larger twin of Hazeltop; it was dropped at the Three Forks sample depot while Hazeltop stayed on board.")
        rec["scientificValue"] = "NASA: because of its fine grain size, the rock has a higher potential to preserve signs of ancient life; the vein and concretion are evidence of ancient interaction with water."
        rec["evidence"] += [ev_url("nasa-hazeltop-bearwallow"), ev_url("nasa-wildcat-ridge")]
        rec["sourceIds"] += ["nasa-hazeltop-bearwallow", "nasa-wildcat-ridge"]
        rec["region"] = "Jezero Crater, delta front (Wildcat Ridge)"
        rec["media"] = [{"url": "images/catalog/wildcat-ridge-mastcamz.jpg", "credit": "NASA/JPL-Caltech/ASU/MSSS",
                         "caption": "Wildcat Ridge mosaic from Mastcam-Z, sol 518 (Aug. 4, 2022): the two core holes and the bright abrasion patch, about 5 cm across (PIA24928, resized)."}]
        d = dist_m(lat, lon, 18.45864728, 77.40592495)
        rec["location"]["coordinateSource"]["note"] += f" The sample point is {d:.1f} m from the sol 502 waypoint 26_1222; raw images from sol {sol} are tagged site 26 drive 1222."
    if n == 25:
        rec["found"] = "NASA (Sep 10, 2025): the Sapphire Canyon sample, taken from the rock 'Cheyava Falls' in the Bright Angel formation of Neretva Vallis, contains potential biosignatures; the rock shows 'leopard spots' discovered in July 2024."
        rec["scientificValue"] = "NASA says the sample could preserve evidence of ancient microbial life; other, non-biological explanations are being considered."
        rec["evidence"].append(ev_url("nasa-biosignature"))
        rec["sourceIds"].append("nasa-biosignature")
        rec["aliases"] += ["Cheyava Falls", "Bright Angel"]
    add(rec)

# Witness tubes
w = WPI["26_1004"]
rd = raw_dates(499)
add({
    "id": "m2020-witness-tube-2", "title": "Second witness tube sealed", "date": "2022-07-16", "sol": 499,
    "mission": M20[0], "missionId": M20[1], "type": "sample",
    "summary": "NASA lists Sol 499 (July 16, 2022) as the sealing of a witness tube, which records the cleanliness of the sampling system near sample sites.",
    "region": "Jezero Crater, delta front", "aliases": ["Witness tube"],
    "location": loc(w["lat"], w["lon"], "approximate", 30, "m20-mmgis-waypoints",
                    f"Rover position at waypoint 26_1004 (sol {w['sol']}); raw images from sol 499 are tagged site/drive {', '.join(rd[1])}. The tube is inside the rover, so the rover position is the location."),
    "evidence": [ev_url("nasa-mars-rock-samples"), ev_url("m20-raw-images"), ev_url("m20-mmgis-waypoints")],
    "sourceIds": ["nasa-mars-rock-samples", "m20-raw-images", "m20-mmgis-waypoints"],
})
w = WPI["29_0"]
rd = raw_dates(586)
add({
    "id": "m2020-witness-tube-3-amalik", "title": "Third witness tube sealed at Amalik", "date": "2022-10-14", "sol": 586,
    "mission": M20[0], "missionId": M20[1], "type": "sample",
    "summary": "NASA: the third witness tube was sealed on Sol 586 (Oct. 14, 2022) at the 'Amalik' sampling location and was later placed in the rover's backup sample depot.",
    "region": "Jezero Crater, delta front (Amalik)", "aliases": ["Witness tube 3", "Amalik"],
    "location": loc(w["lat"], w["lon"], "approximate", 30, "m20-mmgis-waypoints",
                    f"Rover position at waypoint 29_0 (sol {w['sol']}); raw images from sol 586 are tagged site/drive {', '.join(rd[1])}."),
    "evidence": [ev_url("nasa-mars-rock-samples"), ev_url("m20-raw-images")],
    "sourceIds": ["nasa-mars-rock-samples", "m20-raw-images", "m20-mmgis-waypoints"],
})

# Three Forks depot
lat, lon, diag = poly_centroid(DEPOT)
dwc = dist_m(lat, lon, 18.45864728, 77.40592495)
add({
    "id": "m2020-three-forks-depot", "title": "Three Forks sample depot", "date": "2022-12-21", "sol": 653,
    "mission": M20[0], "missionId": M20[1], "type": "sample-depot",
    "summary": "Perseverance dropped 10 sample tubes in a zigzag pattern, each about 5 to 15 m apart, on flat ground near the base of the delta at 'Three Forks'. The first was dropped Dec. 21, 2022 (sol 653) and the last Jan. 28, 2023 (sol 690). It is the first sample depot on another world and a backup for Mars Sample Return.",
    "found": None,
    "scientificValue": "NASA: a crucial milestone for the NASA-ESA Mars Sample Return campaign; the depot holds a duplicate set in case Perseverance cannot deliver its samples.",
    "region": "Jezero Crater, base of the delta (Three Forks)",
    "aliases": ["Three Forks", "Sample depot"] + DEPOT_NAMES + ["Witness tube 3"],
    "location": loc(lat, lon, "regional", round(diag / 2), "m20-mmgis-depot",
                    f"Centroid of NASA's 'Sample Depot Zone' polygon ({len(DEPOT)} vertices, {diag:.0f} m corner to corner). Individual tube positions are drawn on the NASA depot map image but are not published as coordinates. This point is {dwc:.0f} m from Wildcat Ridge (waypoint 26_1222).",
                    footprint=round(diag / 1000, 3)),
    "evidence": [ev_url("nasa-three-forks-map"), ev_url("m20-mmgis-depot"), ev_url("nasa-mars-rock-samples")],
    "media": [{"url": "images/catalog/three-forks-depot-map.jpg", "credit": CREDIT, "caption": "NASA map of where each of the 10 Three Forks tubes was deposited (PIA25682, resized)."}],
    "sourceIds": ["m20-mmgis-depot", "nasa-three-forks-map", "nasa-mars-rock-samples"],
    "depotContents": DEPOT_NAMES + ["Witness tube 3"],
})

# Latest Perseverance position
p = M20CUR
add({
    "id": "m2020-latest-position", "title": "Perseverance's latest published position", "date": None, "sol": p["sol"],
    "mission": M20[0], "missionId": M20[1], "type": "rover-stop",
    "summary": f"Latest position in NASA's waypoint feed at retrieval: sol {p['sol']}, waypoint {p['RMC']}, total odometry {p['dist_km']} km.",
    "region": "Jezero Crater rim", "aliases": [p["RMC"]],
    "location": loc(p["lat"], p["lon"], "precise", 10, "m20-mmgis-current", f"Feed retrieved 2026-11-13; this record changes as the rover drives."),
    "evidence": [ev_url("m20-mmgis-current")], "sourceIds": ["m20-mmgis-current"],
})

# Backshell and parachute
f26 = next(h for h in HELI if h["Flight"] == 26)
path = HPATH[26]
mlat = sum(c[1] for c in path) / len(path)
mlon = sum(c[0] for c in path) / len(path)
add({
    "id": "m2020-backshell-parachute", "title": "Perseverance backshell and parachute imaged by Ingenuity", "date": "2022-04-19", "sol": f26["Sol"],
    "mission": M20[0], "missionId": M20[1], "type": "hardware",
    "summary": "Ingenuity photographed Perseverance's backshell, supersonic parachute and debris from 8 m altitude during Flight 26 on April 19, 2022. The parachute and backshell were jettisoned at about 2.1 km altitude during landing and hit the ground at about 126 km/h.",
    "found": "NASA: the backshell sits upright; its protective coating appears intact, many of the 80 suspension lines are visible and appear intact, and the parachute canopy shows no signs of damage from supersonic inflation.",
    "scientificValue": "Engineers for Mars Sample Return requested the images because they may show how the landing components performed.",
    "region": "Jezero Crater", "aliases": ["Backshell", "Supersonic parachute", "Ingenuity Flight 26"],
    "location": loc(round(mlat, 8), round(mlon, 8), "approximate", 200, "m20-mmgis-heli-path",
                    f"NASA does not publish coordinates for the hardware. This is the mean of the {len(path)} points of Ingenuity's Flight 26 path; the photos were taken along that ~360 m route before the helicopter flew 75 m west to land. The MMGIS layer dates Flight 26 as sol {f26['Sol']} ({f26['Earth_Date']}); NASA's articles give April 19 local time."),
    "evidence": [ev_url("nasa-backshell"), ev_url("nasa-debris-field"), ev_url("jpl-heli-gear"), ev_url("m20-mmgis-heli-path")],
    "media": [{"url": "images/catalog/perseverance-backshell-ingenuity.jpg", "credit": CREDIT, "caption": "Perseverance's backshell seen from 8 m by Ingenuity during Flight 26 (PIA25219, resized)."}],
    "sourceIds": ["m20-mmgis-heli-path", "nasa-backshell", "nasa-debris-field", "jpl-heli-gear"],
})

# ================================================================ Ingenuity
for h in HELI:
    n = h["Flight"]
    date = parse_date(h["Earth_Date"])
    base = {
        "mission": ING[0], "missionId": ING[1], "region": "Jezero Crater",
        "location": loc(h["Lat"], h["Lon"], "precise", 10, "m20-mmgis-heli-waypoints",
                        f"Landing point of the flight in NASA's helicopter waypoint layer (elevation {h['Elev_Geoid']} m geoid)."),
        "evidence": [ev_url("m20-mmgis-heli-waypoints")], "sourceIds": ["m20-mmgis-heli-waypoints"],
        "date": date, "sol": h["Sol"],
    }
    if n == 0:
        base.update({"id": "ingenuity-deployed", "title": "Ingenuity placed on the surface", "type": "hardware",
                     "summary": f"First helicopter position in NASA's layer (Flight 0, sol {h['Sol']}, {h['Earth_Date']}) at {h['ToAirfld']}, before the first flight.",
                     "aliases": ["Wright Brothers Field", "Flight 0"]})
    elif n == 72:
        base.update({"id": "ingenuity-flight-72-final", "title": "Ingenuity Flight 72: final flight", "type": "end-of-mission",
                     "summary": f"On {h['Earth_Date']} (sol {h['Sol']}) contact was lost just before landing; the helicopter dropped about 1 m and damaged its rotors, ending its ability to fly. Over almost 3 years it made 72 flights and logged more than 2 hours aloft (layer total {h['total_min']} min, {h['Total_km']} km).",
                     "aliases": ["Flight 72", h["ToAirfld"], "Ingenuity final resting place"]})
        base["evidence"].append(ev_url("nssdca-mars2020"))
        base["sourceIds"].append("nssdca-mars2020")
    else:
        base.update({"id": f"ingenuity-flight-{n:02d}", "title": f"Ingenuity Flight {n}", "type": "flight",
                     "summary": f"Flight {n} from {h['FromAirfld']} to {h['ToAirfld']}: {h['Dist_m']} m in {h['Duration_s']} s, max altitude {h['Max_Alt_m']} m (NASA layer values).",
                     "aliases": [f"Flight {n}", h["ToAirfld"]]})
        if n == 1:
            base["title"] = "Ingenuity Flight 1: first powered flight on another planet"
            base["summary"] = "First flight on 19 April 2021: 39.1 s, hovering at 3 m altitude for 30 s (NSSDCA). It took off from and landed at Wright Brothers Field."
            base["evidence"].append(ev_url("nssdca-mars2020"))
            base["sourceIds"].append("nssdca-mars2020")
        if n == 26:
            base["summary"] += " On this flight Ingenuity photographed Perseverance's backshell and parachute."
            base["evidence"].append(ev_url("jpl-heli-gear"))
    add(base)

# ================================================================ Curiosity
p = MWP[0]
assert p["RMC"] == "2_0"
add({
    "id": "msl-landing", "title": "Curiosity lands in Gale Crater", "date": "2012-08-06", "sol": 0,
    "mission": MSL[0], "missionId": MSL[1], "type": "landing",
    "summary": "Curiosity touched down at 05:32 UTC (Earth received time) on 6 August 2012 inside Gale Crater, at a site named Bradbury Landing on the plain Aeolis Palus near Mount Sharp. The site was chosen for its potential as a former or current habitat for life.",
    "region": "Gale Crater, Aeolis Palus", "aliases": ["Bradbury Landing", "Bradbury Site"],
    "location": loc(p["lat"], p["lon"], "precise", 10, "msl-mmgis-waypoints",
                    f"First point in the NASA waypoint feed (RMC 2_0, sol {p['sol']}); the rover did not drive until sol 16 (waypoint 3_78, 7 m away). GISS Mars24 gives 137.44 E, 4.59 S; JPL Horizons gives 137.4417 E and prints the latitude as 4.55895 S, which looks like a transposition of 4.5895."),
    "evidence": [ev_url("nssdca-msl"), ev_url("giss-mars24-landers"), ev_url("jpl-horizons-msl"), ev_url("msl-mmgis-waypoints")],
    "sourceIds": ["msl-mmgis-waypoints", "nssdca-msl", "giss-mars24-landers", "jpl-horizons-msl"],
})
p = next(x for x in MWP if x["RMC"] == "3_78")
add({
    "id": "msl-first-drive", "title": "Curiosity's first drive", "date": "2012-08-22", "sol": 16,
    "mission": MSL[0], "missionId": MSL[1], "type": "rover-stop",
    "summary": "After a checkout period, Curiosity made its first drive on 22 August 2012 (NSSDCA). NASA's waypoint feed records the end of that drive on sol 16, 7 m from the landing point.",
    "region": "Gale Crater, Bradbury Landing", "aliases": ["Waypoint 3_78"],
    "location": loc(p["lat"], p["lon"], "precise", 10, "msl-mmgis-waypoints", "Waypoint RMC 3_78, sol 16; the REMS feed maps sol 16 to 2012-08-22."),
    "evidence": [ev_url("nssdca-msl"), ev_url("msl-mmgis-waypoints"), ev_url("msl-rems-feed")],
    "sourceIds": ["msl-mmgis-waypoints", "nssdca-msl", "msl-rems-feed"],
})
for f in MSLSURF:
    pr = f["properties"]
    lat, lon, diag = poly_centroid(f["geometry"]["coordinates"][0])
    add({
        "id": "msl-site-" + re.sub(r"[^a-z0-9]+", "-", pr["Name"].lower()).strip("-"),
        "title": f"Curiosity at {pr['Name']}", "date": None, "sol": None,
        "mission": MSL[0], "missionId": MSL[1], "type": "rover-stop",
        "summary": f"NASA's Curiosity location map marks '{pr['Name']}' as a surface-view site (site {pr['site']}, position {pr['pos']}). The layer gives no sol.",
        "region": "Gale Crater", "aliases": [pr["Name"]],
        "location": loc(lat, lon, "approximate", round(diag / 2), "msl-mmgis-surface-sites", f"Centroid of the NASA surface-view box ({diag:.0f} m corner to corner)."),
        "evidence": [ev_url("msl-mmgis-surface-sites")], "sourceIds": ["msl-mmgis-surface-sites"],
    })

DRILLS = [("John Klein", "Feb. 8, 2013", 182), ("Cumberland", "May 19, 2013", 279), ("Windjana", "May 5, 2014", 621),
          ("Confidence Hills", "Sept. 24, 2014", 759), ("Mojave", "Jan. 29, 2015", 882), ("Telegraph Peak", "Feb. 24, 2015", 908),
          ("Buckskin", "July 30, 2015", 1060), ("Big Sky", "Sept. 29, 2015", 1119), ("Greenhorn", "Oct. 18, 2015", 1137),
          ("Lubango", "April 23, 2016", 1320), ("Okoruso", "May 5, 2016", 1332), ("Oudam", "June 4, 2016", 1361),
          ("Marimba", "Aug. 6, 2016", 1422), ("Quela", "Sept. 18, 2016", 1464)]
for i, (name, ds, sol) in enumerate(DRILLS, 1):
    w = wp_at_or_before(MWP, sol)
    gap = sol - w["sol"]
    unc = 50 if gap <= 15 else 150
    rec = {
        "id": "msl-drill-" + re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-"),
        "title": f"Curiosity drills '{name}'" + (" (first drill sample)" if i == 1 else ""),
        "date": parse_date(ds), "sol": sol, "mission": MSL[0], "missionId": MSL[1], "type": "sample",
        "summary": f"Curiosity drilled rock sample site '{name}' on {ds} (Sol {sol}), per NASA's list of its first sampling sites.",
        "region": "Gale Crater", "aliases": [name],
        "location": loc(w["lat"], w["lon"], "approximate", unc, "msl-mmgis-waypoints",
                        f"Rover position at waypoint {w['RMC']} (sol {w['sol']}), the last NASA localization at or before the drilling sol ({gap} sols earlier). The drill hole is within arm's reach; its exact offset is not published."),
        "evidence": [ev_url("nasa-msl-16-sites"), ev_url("msl-mmgis-waypoints")],
        "sourceIds": ["nasa-msl-16-sites", "msl-mmgis-waypoints"],
    }
    if name == "Marimba":
        rec["summary"] += " (The NASA caption prints the year as '2106'; it is listed between June and September 2016 sites, so 2016 is used.)"
    if name == "Quela":
        rec["summary"] = "Curiosity drilled into bedrock of the Murray formation at 'Quela' on Sept. 18, 2016, the 1,464th sol of the mission."
    if i == 1:
        rec["summary"] = "On Feb. 8, 2013 (Sol 182), Curiosity used its drill to collect a rock sample for the first time, at a rock called 'John Klein' in the Yellowknife Bay area. JPL: the first time any robot drilled into a rock on Mars to collect a sample."
        rec["region"] = "Gale Crater, Yellowknife Bay"
        rec["evidence"].insert(0, ev_url("jpl-john-klein"))
        rec["sourceIds"].append("jpl-john-klein")
    add(rec)

w = wp_at_or_before(MWP, 4200)
add({
    "id": "msl-gediz-vallis-sulfur", "title": "Curiosity cracks open pure sulfur in Gediz Vallis channel", "date": "2024-05-30", "sol": 4200,
    "mission": MSL[0], "missionId": MSL[1], "type": "science-observation",
    "summary": "On May 30, 2024, Curiosity drove over a rock and cracked it open, revealing yellow crystals; an instrument on the rover's arm showed they are elemental sulfur.",
    "found": "Elemental (pure) sulfur crystals, the first of this kind of sulfur found on Mars.",
    "scientificValue": "JPL: elemental sulfur forms in only a narrow range of conditions that scientists had not associated with this location's history, so its origin is an open question.",
    "region": "Gale Crater, Mount Sharp, Gediz Vallis channel", "aliases": ["Gediz Vallis", "Sulfur crystals", "Snow Lake"],
    "location": loc(w["lat"], w["lon"], "approximate", 150, "msl-mmgis-waypoints",
                    f"Rover position at waypoint {w['RMC']} (sol {w['sol']}), the last localization at or before sol 4200. Sol 4200 is derived: JPL dates the 'Snow Lake' image to June 8, 2024 = sol 4209 and says the rock was crushed nine days earlier; the REMS feed maps sol 4200 to 2024-05-30. The rock was crushed during a drive, so it lies on that drive's track."),
    "evidence": [ev_url("jpl-sulfur"), ev_url("msl-mmgis-waypoints"), ev_url("msl-rems-feed")],
    "media": [{"url": "images/catalog/curiosity-sulfur-crystals.jpg", "credit": "NASA/JPL-Caltech/MSSS", "caption": "Sulfur crystals inside the rock Curiosity cracked open (PIA26309, resized)."}],
    "sourceIds": ["jpl-sulfur", "msl-mmgis-waypoints", "msl-rems-feed"],
})

sol_pp = next(int(s) for s, x in REMS.items() if x["terrestrial_date"] == "2019-05-15")
w = wp_at_or_before(MWP, sol_pp)
add({
    "id": "msl-proposed-path-mount-sharp", "title": "Curiosity's proposed path up Mount Sharp (2019 plan)", "date": "2019-05-15", "sol": None,
    "mission": MSL[0], "missionId": MSL[1], "type": "proposed-path", "observed": False,
    "summary": "A NASA animation and annotated map (May 15, 2019) of a proposed route for Curiosity climbing lower Mount Sharp, labelling regions the science team would like to explore. Built from MRO HiRISE, CRISM and CTX and ESA Mars Express HRSC data. This is a plan, not the observed traverse.",
    "region": "Gale Crater, lower Mount Sharp (Aeolis Mons)", "aliases": ["Mount Sharp route", "Proposed path"],
    "location": loc(w["lat"], w["lon"], "regional", None, "msl-mmgis-waypoints",
                    f"The NASA route is an image and animation with no georeferenced points, so no path array is given. This point is only an anchor: Curiosity's position on the publication date (sol {sol_pp} = 2019-05-15 per the REMS feed; waypoint {w['RMC']}, sol {w['sol']}). The proposed route starts near here and climbs south up Mount Sharp."),
    "evidence": [ev_url("nasa-msl-proposed-path"), ev_url("msl-mmgis-waypoints")],
    "sourceIds": ["nasa-msl-proposed-path", "msl-mmgis-waypoints", "msl-rems-feed"],
})
p = MSLCUR
add({
    "id": "msl-latest-position", "title": "Curiosity's latest published position", "date": None, "sol": p["sol"],
    "mission": MSL[0], "missionId": MSL[1], "type": "rover-stop",
    "summary": f"Latest position in NASA's waypoint feed at retrieval: sol {p['sol']}, waypoint {p['RMC']}, total odometry {p['dist_km']} km.",
    "region": "Gale Crater, Mount Sharp", "aliases": [p["RMC"]],
    "location": loc(p["lat"], p["lon"], "precise", 10, "msl-mmgis-current", "Feed retrieved 2026-11-13; this record changes as the rover drives."),
    "evidence": [ev_url("msl-mmgis-current")], "sourceIds": ["msl-mmgis-current"],
})
add({
    "id": "msl-scoop-rocknest-gobabeb", "title": "Curiosity soil scoops at Rocknest and Gobabeb", "date": None, "sol": None,
    "mission": MSL[0], "missionId": MSL[1], "type": "sample",
    "summary": "NASA: Curiosity scooped two soil samples at each of two sites, Rocknest and Gobabeb.",
    "region": "Gale Crater", "aliases": ["Rocknest", "Gobabeb"],
    "reasonUnlocated": "The NASA caption names the sites but gives no sol or date, so they cannot be tied to a waypoint from this source.",
    "evidence": [ev_url("nasa-msl-16-sites")], "sourceIds": ["nasa-msl-16-sites"],
}, unlocated=True)

# ================================================================ Other landers
def lander(id_, title, date, mission, mid, summary, region, aliases, lat, lon, prec, unc, sid, note, ev, sids, media=None, typ="landing"):
    add({"id": id_, "title": title, "date": date, "sol": 0 if typ == "landing" else None, "mission": mission, "missionId": mid,
         "type": typ, "summary": summary, "region": region, "aliases": aliases,
         "location": loc(lat, lon, prec, unc, sid, note), "evidence": [ev_url(s) for s in ev], "media": media or [], "sourceIds": sids})


lander("viking1-landing", "Viking 1 lands in Chryse Planitia", "1976-07-20", "Viking 1 Lander", "viking1",
       "The Viking 1 Lander touched down in western Chryse Planitia at 11:53:06 UT on July 20, 1976, the first completely successful Mars landing (GISS). It operated until November 1982 (GISS: mission sol 2243, Nov. 11, 1982; NSSDCA: contact lost 13 November 1982). Later named the Thomas Mutch Memorial Station.",
       "Chryse Planitia", ["Thomas Mutch Memorial Station", "VL1"], 22.27, lon180(312.05), "approximate", 600, "nssdca-viking1-lander",
       "NSSDCA: 22.27 deg N, 312.05 deg E (planetocentric); converted 312.05 E (0-360) to -47.95. GISS Mars24 gives the same values (citing Kuchynka et al. 2014). Two-decimal precision, about 600 m.",
       ["nssdca-viking1-lander", "giss-mars24-landers"], ["nssdca-viking1-lander", "giss-mars24-landers"])
lander("viking2-landing", "Viking 2 lands in Utopia Planitia", "1976-09-03", "Viking 2 Lander", "viking2",
       "The Viking 2 Lander touched down about 200 km west of the crater Mie in Utopia Planitia at 22:58:20 UT on Sep. 3, 1976. It was turned off on April 11, 1980 when its batteries failed. Later named the Gerald Soffen Memorial Station.",
       "Utopia Planitia", ["Gerald Soffen Memorial Station", "VL2"], 48.27, 134.28, "approximate", 1000, "giss-mars24-landers",
       "GISS Mars24: 134.28 E, 48.27 N, taken from Kuchynka et al. (2014). NSSDCA gives an older value of 47.6673 N, 134.2809 E (about 35 km south); the newer GISS value is used. Datum not stated on the GISS page; its values for Viking 1, Curiosity and Perseverance match planetocentric NASA values.",
       ["giss-mars24-landers", "nssdca-viking2-lander"], ["giss-mars24-landers", "nssdca-viking2-lander"])
lander("pathfinder-landing", "Mars Pathfinder and Sojourner land in Ares Vallis", "1997-07-04", "Mars Pathfinder (with Sojourner rover)", "pathfinder",
       "Mars Pathfinder hit the surface on airbags at 16:56:55 UT on 4 July 1997 in the Ares Vallis outflow channel. It carried the Sojourner rover, which travelled about 100 m (GISS). Last transmission: GISS gives mission sol 93 (Oct. 7, 1997); NSSDCA says communications were lost on 27 September 1997. Named the Carl Sagan Memorial Station.",
       "Ares Vallis", ["Carl Sagan Memorial Station", "Sojourner", "MPF"], 19.47, lon180(326.75), "approximate", 600, "giss-mars24-landers",
       "GISS Mars24: 326.75 E, 19.47 N (Kuchynka et al. 2014); converted 326.75 E to -33.25. NSSDCA gives 19.33 N, 33.55 W (= -33.55 E) without a datum; the GISS value is used.",
       ["giss-mars24-landers", "nssdca-pathfinder"], ["giss-mars24-landers", "nssdca-pathfinder"])
lander("spirit-landing", "Spirit lands in Gusev Crater", "2004-01-04", "Mars Exploration Rover Spirit (MER-A)", "mer-spirit",
       "Spirit landed at 04:35 UT on 4 January 2004 (Earth received time) in Gusev Crater, chosen because it looks like a crater lakebed. Landing site named Columbia Memorial Station (GISS).",
       "Gusev Crater", ["Columbia Memorial Station", "MER-A"], -14.572, 175.478, "precise", 100, "nssdca-spirit",
       "NSSDCA: 14.572 S, 175.478 E. GISS Mars24 gives 175.48 E, -14.57 N (from Li et al. 2005-2007). Three-decimal precision, about 60 m.",
       ["nssdca-spirit", "giss-mars24-landers"], ["nssdca-spirit", "giss-mars24-landers"])
lander("opportunity-landing", "Opportunity lands in Meridiani Planum", "2004-01-25", "Mars Exploration Rover Opportunity (MER-B)", "mer-opportunity",
       "Opportunity entered the atmosphere on 25 January 2004 and came to rest in a 20 m diameter crater (Eagle Crater) in Terra Meridiani, the 'Hematite Site'. Landing site named Challenger Memorial Station (GISS).",
       "Meridiani Planum", ["Eagle Crater", "Challenger Memorial Station", "MER-B"], -1.946, lon180(354.473), "precise", 100, "nssdca-opportunity",
       "NSSDCA: 1.946 S, 354.473 E (IAU 2000 body-centered, i.e. planetocentric); converted 354.473 E to -5.527. GISS gives 354.47 E, -1.95 N.",
       ["nssdca-opportunity", "giss-mars24-landers", "nasa-opp-final-map"], ["nssdca-opportunity", "giss-mars24-landers"])
lander("phoenix-landing", "Phoenix lands in the northern plains", "2008-05-25", "Phoenix Mars Lander", "phoenix",
       "Phoenix soft-landed on 25 May 2008 (touchdown 23:53:44 UT Earth time per NSSDCA) in Green Valley, Vastitas Borealis, a boulder-poor area with a high ratio of ice to rock. Its last signal was received on 2 November 2008.",
       "Vastitas Borealis (Green Valley)", ["Green Valley", "PHX"], 68.21883, lon180(234.250778), "precise", 100, "jpl-horizons-phoenix",
       "JPL Horizons record -84: 68.21883 N, 234.250778 E; converted to -125.749222. GISS gives 234.25 E, 68.22 N. NSSDCA gives only a nominal 68.15 N, 125.9 W.",
       ["jpl-horizons-phoenix", "giss-mars24-landers", "nssdca-phoenix"], ["jpl-horizons-phoenix", "giss-mars24-landers", "nssdca-phoenix"])
lander("insight-landing", "InSight lands in Elysium Planitia", "2018-11-26", "InSight", "insight",
       "InSight landed in western Elysium Planitia at 19:52:59 UT on 26 November 2018 to study the planet's interior. Its last transmission was received on 15 December 2022 (sol 1440, per GISS) and the mission was then declared over; the lander stays at its landing site.",
       "Elysium Planitia", ["NSYT"], 4.50, 135.62, "approximate", 3500, "giss-mars24-landers",
       "GISS Mars24: 135.62 E, 4.50 N (provided by B. Semenov). JPL Horizons record -189 states an 'achieved landing site' of 135.623447 E, 4.555681 N, about 3 km north. The two NASA values disagree, so the point is approximate with an uncertainty that covers both.",
       ["giss-mars24-landers", "jpl-horizons-insight", "nssdca-insight"], ["giss-mars24-landers", "jpl-horizons-insight", "nssdca-insight"])
add({
    "id": "spirit-troy-end-of-mission", "title": "Spirit's last position at Troy", "date": "2010-03-22", "sol": 2210,
    "mission": "Mars Exploration Rover Spirit (MER-A)", "missionId": "mer-spirit", "type": "end-of-mission",
    "summary": "Spirit became stuck in soft soil at a site called 'Troy' beside Home Plate in May 2009, which kept it from tilting its solar panels toward the Sun for the coming winter (GISS). Its last communication was received on mission sol 2210 (22 March 2010); NASA ended the mission in May 2011. It travelled 7.73 km in total.",
    "region": "Gusev Crater, Columbia Hills, Home Plate", "aliases": ["Troy", "Home Plate"],
    "location": loc(-14.6, 175.5, "regional", 3000, "nasa-troy",
                    "NASA Photojournal PIA12205: 'The site is at 14.6 degrees south latitude, 175.5 degrees east longitude.' One-decimal values only, so this is regional (about 6 km per 0.1 degree)."),
    "evidence": [ev_url("nasa-troy"), ev_url("giss-mars24-landers"), ev_url("nssdca-spirit")],
    "media": [{"url": "images/catalog/spirit-at-troy-hirise.jpg", "credit": "NASA/JPL-Caltech/University of Arizona", "caption": "HiRISE view of Home Plate with Spirit at Troy (PIA12205, resized)."}],
    "sourceIds": ["nasa-troy", "giss-mars24-landers", "nssdca-spirit"],
})
add({
    "id": "opportunity-final-position", "title": "Opportunity's final position in Perseverance Valley", "date": "2018-06-10", "sol": 5111,
    "mission": "Mars Exploration Rover Opportunity (MER-B)", "missionId": "mer-opportunity", "type": "end-of-mission",
    "summary": "Opportunity made its last contact on June 10, 2018 (sol 5111) during a planet-wide dust storm while descending into Endeavour Crater through Perseverance Valley, on the valley's western limb. NASA declared the mission over on Feb. 13, 2019, after 45.16 km of driving.",
    "region": "Meridiani Planum, Endeavour Crater rim, Perseverance Valley", "aliases": ["Perseverance Valley", "Endeavour Crater"],
    "reasonUnlocated": "NASA's final traverse map and end-of-mission article place the rover in Perseverance Valley but give no coordinates, and the map image is not georeferenced in the fetched source.",
    "evidence": [ev_url("nasa-opp-final-map"), ev_url("nasa-opp-end"), ev_url("giss-mars24-landers")],
    "sourceIds": ["nasa-opp-final-map", "nasa-opp-end", "giss-mars24-landers"],
}, unlocated=True)
add({
    "id": "mars-polar-lander-loss", "title": "Mars Polar Lander and Deep Space 2 lost on arrival", "date": "1999-12-03", "sol": None,
    "mission": "Mars Polar Lander / Deep Space 2", "missionId": "mpl", "type": "landing",
    "summary": "Mars Polar Lander was to touch down on the southern polar layered terrain between 73 S and 76 S; GISS says it likely crashed on descent on Dec. 3, 1999, probably after premature engine shutdown. Its two Deep Space 2 microprobes presumably impacted about 60 km away.",
    "region": "Planum Australe", "aliases": ["MPL", "Deep Space 2"],
    "reasonUnlocated": "The hardware has never been found. GISS gives only presumed impact points ('about 195.3 W, -76.1 N' for MPL and 'about 196.5 W, -75.0 N' for Deep Space 2), which are not observed locations.",
    "evidence": [ev_url("nssdca-mpl"), ev_url("giss-mars24-landers")],
    "sourceIds": ["nssdca-mpl", "giss-mars24-landers"],
}, unlocated=True)
add({
    "id": "m2020-witness-tube-1", "title": "First witness tube sealed", "date": None, "sol": None,
    "mission": M20[0], "missionId": M20[1], "type": "sample",
    "summary": "The NASA samples page says a witness tube was sealed on 'Sol 160 (June 22, 2021)'; the image caption on the same page shows the witness tube being sealed on June 21, 2021, 'the 120th sol'.",
    "region": "Jezero Crater", "aliases": ["Witness tube 1"],
    "reasonUnlocated": "The NASA page gives two inconsistent sols (160 and 120) for the first witness tube; the raw image feed maps sol 160 to 2021-08-02, not June 2021. The rover position cannot be chosen without a consistent sol.",
    "evidence": [ev_url("nasa-mars-rock-samples"), ev_url("m20-raw-images")],
    "sourceIds": ["nasa-mars-rock-samples", "m20-raw-images"],
}, unlocated=True)

# ---------------------------------------------------------------- checks and counts
ids = [e["id"] for e in EVENTS + UNLOC]
dups = {i for i in ids if ids.count(i) > 1}
assert not dups, dups
by = {}
for e in EVENTS + UNLOC:
    kind = "unlocated" if e["location"] is None else ("mapped" if e["location"]["precision"] == "precise" else "approximate")
    for sid in e["sourceIds"]:
        by.setdefault(sid, {"mapped": 0, "approximate": 0, "unlocated": 0})[kind] += 1
total = {"mapped": sum(1 for e in EVENTS if e["location"]["precision"] == "precise"),
         "approximate": sum(1 for e in EVENTS if e["location"]["precision"] != "precise"),
         "unlocated": len(UNLOC)}
used = sorted({s for e in EVENTS + UNLOC for s in e["sourceIds"]} | {"m20-mmgis-config", "msl-mmgis-config"})
out = {
    "generatedAt": datetime.date.today().isoformat(),
    "convention": "planetocentric latitude, east longitude -180..180",
    "notes": [
        "Counts: 'mapped' = precise points; 'approximate' = approximate or regional points. bySource counts a record once under each source id it cites.",
        "All coordinates were taken from fetched NASA/JPL files on the generation date; see each record's coordinateSource.",
        "Raw downloads are not stored in the repository.",
    ],
    "sources": [SRC[s] for s in used],
    "events": EVENTS,
    "unlocated": UNLOC,
    "counts": {"bySource": {k: by[k] for k in sorted(by)}, "total": total},
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(out, f, indent=2, ensure_ascii=False)
    f.write("\n")
print(json.dumps(out["counts"]["total"]), len(EVENTS), len(UNLOC))
