import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import rocketUrl from "../assets/models/redrock-lander.glb?url";
import { nasaInsignia } from "./nasaMark.ts";

/**
 * 3D marker meshes shared by the globe and the local terrain. Every marker is built with
 * its base at the origin and "up" along +Y, normalised to a height of 1, so callers anchor
 * it to a surface point, rotate +Y onto the surface normal and scale it for the zoom level.
 */

let rocketTemplate: Promise<THREE.Group> | null = null;

/** Loads the team-supplied Redrock lander once, normalised to height 1 with its base at y = 0. */
export function loadRocket(): Promise<THREE.Group> {
  rocketTemplate ??= new GLTFLoader().loadAsync(rocketUrl).then((gltf) => {
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const height = box.max.y - box.min.y || 1;
    const wrapper = new THREE.Group();
    model.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    wrapper.add(model);
    wrapper.scale.setScalar(1 / height);
    const outer = new THREE.Group();
    outer.add(wrapper);
    return outer;
  });
  return rocketTemplate;
}

/** A rocket instance; a simple placeholder block shows until the model loads (or if it fails). */
export function createRocket(onReady?: () => void): THREE.Group {
  const group = new THREE.Group();
  const placeholder = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1, 8), new THREE.MeshLambertMaterial({ color: "#EAF2FF" }));
  placeholder.position.y = 0.5;
  group.add(placeholder);
  loadRocket().then((template) => {
    group.remove(placeholder);
    placeholder.geometry.dispose();
    (placeholder.material as THREE.Material).dispose();
    // Share geometry and materials with the template; never dispose them per instance.
    const instance = template.clone(true);
    instance.userData.sharedTemplate = true;
    group.add(instance);
    onReady?.();
  }, () => { /* keep the placeholder if the model cannot load */ });
  return group;
}

/** Highlight state: brighter accent plate and a slight scale bump. */
export function setMarkerSelected(group: THREE.Object3D, selected: boolean, accent: string) {
  const plate = group.getObjectByName("accent") as THREE.Mesh | undefined;
  if (plate) (plate.material as THREE.MeshBasicMaterial).color.set(selected ? "#FFFFFF" : accent);
  group.userData.selectedBoost = selected ? 1.25 : 1;
}

/** Dispose geometry and materials a marker owns, skipping the shared rocket template. */
export function disposeMarker(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child.userData.sharedTemplate) return;
    let shared = false;
    for (let p = child.parent; p; p = p.parent) if (p.userData.sharedTemplate) shared = true;
    if (shared) return;
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((m) => m.dispose()); else material?.dispose();
  });
}

export { TYPE_ACCENT } from "./accents.ts";
let nasaSourceTexture: THREE.CanvasTexture | undefined;
function nasaFlagTexture() {
  if (nasaSourceTexture) return nasaSourceTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext("2d")!;
  const drawFlag = (color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 256, 160);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 5;
    ctx.strokeRect(2.5, 2.5, 251, 155);
  };
  drawFlag("#153655");
  ctx.fillStyle = "#e78759";
  ctx.fillRect(5, 129, 246, 9);
  ctx.fillStyle = "#fff";
  ctx.font = "700 76px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("NASA", 128, 78);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  nasaSourceTexture = texture;
  if (nasaInsignia) {
    const logo = new Image();
    logo.crossOrigin = "anonymous";
    logo.onload = () => {
      const height = 150;
      const width = height * logo.naturalWidth / logo.naturalHeight;
      drawFlag("#f5f7fb");
      ctx.drawImage(logo, (256 - width) / 2, (160 - height) / 2, width, height);
      texture.needsUpdate = true;
    };
    logo.src = nasaInsignia;
  }
  return texture;
}

export function createRouteFlag(accent: string, nasaSource = false) {
  const flag = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.95, 0.09),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  pole.position.y = 0.475;
  flag.add(pole);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5),
    new THREE.MeshBasicMaterial({
      map: nasaSource ? nasaFlagTexture() : null,
      color: nasaSource ? "#fff" : accent,
      side: THREE.DoubleSide,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }));
  face.position.set(0.4, 0.7, 0);
  pole.renderOrder = 100;
  face.renderOrder = 101;
  flag.add(face);
  return flag;
}
