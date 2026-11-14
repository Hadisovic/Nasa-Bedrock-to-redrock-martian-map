"""Run Trek searchItems keyword queries; save raw JSON and print a compact table.
usage: search.py OUTDIR key1 key2 ...  (keys may contain spaces)"""
import sys, os, json, subprocess, urllib.parse

out = sys.argv[1]
for key in sys.argv[2:]:
    url = ("https://trek.nasa.gov/mars/TrekServices/ws/index/eq/searchItems?key="
           + urllib.parse.quote(key) + "&start=0&rows=60")
    raw = subprocess.run(["curl", "-sL", url], capture_output=True, text=True).stdout
    fn = os.path.join(out, "search_" + key.replace(" ", "_").replace("/", "-") + ".json")
    open(fn, "w").write(raw)
    try:
        d = json.loads(raw)
    except Exception:
        print("##", key, "non-JSON response"); continue
    docs = d["response"]["docs"]
    print(f"## key={key!r} numFound={d['response']['numFound']}")
    for doc in docs:
        if doc.get("itemType") not in ("product", "autolayer", "dataset"):
            continue
        lay = ""
        try:
            L = json.loads(doc.get("layers", ["[]"])[0]) if doc.get("layers") else []
            lay = ";".join(f"{x.get('layerId') or x.get('Layer') or list(x.values())[0]}" for x in L)[:120] if isinstance(L, list) else str(L)[:120]
        except Exception:
            lay = str(doc.get("layers"))[:120]
        print(" |", doc.get("title"), "|", doc.get("productLabel"), "|", doc.get("itemType"), "|",
              doc.get("bbox"), "|", doc.get("resolution"), "|", doc.get("item_UUID"))
