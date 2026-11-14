import type { LayerEntry } from "./catalog.ts";

/** Keep published map categories and individual GRS measurement bins intact. */
export function discreteOverlay(layer: LayerEntry) {
  return layer.legend?.type === "categorical" || layer.id.startsWith("grs-");
}
