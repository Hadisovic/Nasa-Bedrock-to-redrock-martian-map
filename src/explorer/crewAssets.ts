import astronautUrl from "../assets/models/space-astronaut.glb?url";
import roverUrl from "../assets/models/perseverance-nasa.glb?url";

function cachedModel(url: string, label: string) {
  let bytesRequest: Promise<ArrayBuffer> | undefined;
  return () => bytesRequest ??= fetch(url).then(async (response) => {
    if (!response.ok) throw new Error(`${label} request failed (${response.status}).`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength < 12 || new TextDecoder().decode(new Uint8Array(bytes, 0, 4)) !== "glTF") {
      throw new Error(`${label} is not a GLB file.`);
    }
    return bytes;
  }).catch((error) => {
    bytesRequest = undefined;
    throw error;
  });
}

export const preloadAstronautModel = cachedModel(astronautUrl, "Astronaut model");
export const preloadRoverModel = cachedModel(roverUrl, "Perseverance model");
