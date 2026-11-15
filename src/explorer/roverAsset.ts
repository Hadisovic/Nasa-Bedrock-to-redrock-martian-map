import roverUrl from "../assets/models/perseverance-nasa.glb?url";

let roverBytes: Promise<ArrayBuffer> | undefined;

export function preloadRoverModel(): Promise<ArrayBuffer> {
  return roverBytes ??= fetch(roverUrl).then(async (response) => {
    if (!response.ok) throw new Error(`Perseverance model request failed (${response.status}).`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength < 12 || new TextDecoder().decode(new Uint8Array(bytes, 0, 4)) !== "glTF") {
      throw new Error("Perseverance model is not a GLB file.");
    }
    return bytes;
  }).catch((error) => {
    roverBytes = undefined;
    throw error;
  });
}
