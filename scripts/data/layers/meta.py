"""For each 'label:uuid' argument fetch layer services, abstract, legend and WMTS capabilities.
usage: meta.py OUTDIR label:uuid ..."""
import sys, os, json, subprocess, re

out = sys.argv[1]


def curl(url, path):
    r = subprocess.run(["curl", "-sL", "-m", "40", "-o", path, "-w", "%{http_code} %{content_type} %{size_download}", url],
                       capture_output=True, text=True)
    return r.stdout


for arg in sys.argv[2:]:
    label, uuid = arg.split(":")
    d = os.path.join(out, label)
    os.makedirs(d, exist_ok=True)
    print("=====", label)
    st = curl(f"https://trek.nasa.gov/mars/TrekServices/ws/index/getLayerServices?uuid={uuid}", f"{d}/services.json")
    print(" services", st)
    try:
        sv = json.load(open(f"{d}/services.json"))
        print(" ", json.dumps(sv)[:600])
    except Exception as e:
        print("  services parse fail", e)
    st = curl(f"https://trek.nasa.gov/mars/TrekWS/rest/cat/abstract?label={label}", f"{d}/abstract.txt")
    print(" abstract", st)
    st = curl(f"https://trek.nasa.gov/mars/TrekWS/rest/cat/legend/stream?label={label}", f"{d}/legend.bin")
    print(" legend", st)
    st = curl(f"https://trek.nasa.gov/mars/TrekWS/rest/cat/metadata/fgdc/html?label={label}", f"{d}/fgdc.html")
    print(" fgdc", st)
    st = curl(f"https://trek.nasa.gov/tiles/Mars/EQ/{label}/1.0.0/WMTSCapabilities.xml", f"{d}/caps.xml")
    print(" caps", st)
    try:
        x = open(f"{d}/caps.xml").read()
        fm = re.findall(r"<Format>(.*?)</Format>", x)
        lc = re.findall(r"<ows:LowerCorner>(.*?)</ows:LowerCorner>", x)[:1]
        uc = re.findall(r"<ows:UpperCorner>(.*?)</ows:UpperCorner>", x)[:1]
        tl = set(re.findall(r"<TopLeftCorner>(.*?)</TopLeftCorner>", x))
        n = len(re.findall(r"<TileMatrix>", x))
        m0 = re.search(r"<TileMatrix><ows:Identifier>0</ows:Identifier>.*?</TileMatrix>", x, re.S)
        print("  formats", fm, "bbox", lc, uc, "topleft", tl, "levels", n)
        if m0:
            print("  L0", re.sub(r"\s+", " ", m0.group(0))[:400])
    except Exception as e:
        print("  caps parse fail", e)
