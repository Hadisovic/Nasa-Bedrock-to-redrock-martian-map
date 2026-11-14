# Catalog and layer generators

These are the scripts, as run on 2026-11-13, that produced the generated data:
- `scripts/data/catalog/` produced `data/mars/catalog/*.json` and `public/images/catalog/`;
- `scripts/data/layers/` produced `data/mars/layers/manifest.json` and `public/layers/`.

They read raw NASA downloads from a local directory passed on the command line or set at the top of
each script. Raw downloads are not committed. The exact source URLs, product IDs, tile levels and
processing steps are recorded in each output's `sources`, `downloaded` and `processing` fields. See
[catalog-inventory.md](../../docs/research/catalog-inventory.md) and
[layer-search.md](../../docs/research/layer-search.md).

They need Python 3 with numpy, Pillow and tifffile. They are not run by the app or the tests.
