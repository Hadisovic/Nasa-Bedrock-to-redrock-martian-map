import { readdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const approvedInsignia = loadEnv(mode, process.cwd()).VITE_APPROVED_NASA_INSIGNIA;
  return { base: "./", worker: { format: "es" }, plugins: [{
  name: "martian-map-offline-manifest",
  apply: "build",
  async writeBundle(options) {
    const out = resolve(options.dir ?? "dist");
    const assets = (await readdir(join(out, "assets"))).map((name) => "assets/" + name);
    const files = async (paths: string[]) => Promise.all(paths.map(async (path) => ({ path, bytes: (await stat(join(out, path))).size })));
    const wildcat = assets.filter((name) => /\/(elevation|imagery)-[^/]+\.tif$/.test(name));
    wildcat.push("layers/regional/wildcat-geology.png");
    const gale = ["layers/regional/gale-terrain.f32", "layers/regional/gale-terrain.webp", "layers/regional/gale-geology.png"];
    const resources = (await readdir(join(out, "layers/global"))).map((name) => "layers/global/" + name);
    resources.push("layers/regional/ctx-hebrus-valles.png", "layers/regional/hrsc-viking1-h2942.png");
    const photos = (await readdir(join(out, "images/catalog"))).map((name) => "images/catalog/" + name);
    const core = ["index.html", "martian-map.webmanifest", "images/martian-map-cinematic.jpg", "images/martian-map-home.png", "images/martian-map-title.png", "images/martian-map-logo.png", "images/martian-map-badge.png",
      ...assets.filter((name) => !wildcat.includes(name)), ...resources, ...photos];
    if (approvedInsignia && /^[\w-]+(?:\/[\w-]+)*(?:\.local)?\.svg$/i.test(approvedInsignia)) core.push(approvedInsignia);
    await writeFile(join(out, "offline-files.json"), JSON.stringify({
      version: assets.find((name) => /^assets\/index-.*\.js$/.test(name)) ?? assets[0],
      core: await files(core), wildcat: await files(wildcat), gale: await files(gale),
    }));
  },
}] };
});
