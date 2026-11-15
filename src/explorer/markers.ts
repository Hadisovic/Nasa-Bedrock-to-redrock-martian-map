import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import rocketUrl from "../assets/models/redrock-lander.glb?url";
import { badgeBounds, badgeOutline, teamBadgeUrl } from "./teamBadge.tsx";

/**
 * 3D marker meshes shared by the globe and the local terrain. Every marker is built with
 * its base at the origin and "up" along +Y, normalised to a height of 1, so callers anchor
 * it to a surface point, rotate +Y onto the surface normal and scale it for the zoom level.
 */

let rocketTemplate: Promise<THREE.Group> | null = null;
let readyRocket: THREE.Group | undefined;

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
    return readyRocket = outer;
  }).catch((error) => {
    rocketTemplate = null;
    throw error;
  });
  return rocketTemplate;
}

/** A rocket instance with a compact fallback while the bundled model loads. */
export function createRocket(onReady?: () => void): THREE.Group {
  const group = new THREE.Group();
  const addRocket = (template: THREE.Group) => {
    const instance = template.clone(true);
    instance.userData.sharedTemplate = true;
    group.add(instance);
    onReady?.();
  };
  if (readyRocket) {
    addRocket(readyRocket);
    return group;
  }
  const fallback = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.19, .22, .62, 6), new THREE.MeshLambertMaterial({ color: "#b34d36" }));
  const nose = new THREE.Mesh(new THREE.ConeGeometry(.19, .38, 6), new THREE.MeshLambertMaterial({ color: "#e6cdb6" }));
  body.position.y = .31;
  nose.position.y = .81;
  fallback.add(body, nose);
  group.add(fallback);
  void loadRocket().then((template) => {
    if (group.userData.disposed) return;
    group.remove(fallback);
    disposeMarker(fallback);
    addRocket(template);
  }, () => { /* Keep the colored fallback when the model cannot load. */ });
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
  object.userData.disposed = true;
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
let teamSourceTexture: THREE.CanvasTexture | undefined;
function teamFlagTexture() {
  if (teamSourceTexture) return teamSourceTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#213551";
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  teamSourceTexture = texture;
  const logo = new Image();
  logo.onload = () => {
    const scale = (canvas.height - 14) / badgeBounds.height;
    ctx.save();
    ctx.translate((canvas.width - badgeBounds.width * scale) / 2, 7);
    ctx.scale(scale, scale);
    ctx.translate(-badgeBounds.x, -badgeBounds.y);
    ctx.clip(new Path2D(badgeOutline));
    ctx.drawImage(logo, 0, 0);
    ctx.restore();
    texture.needsUpdate = true;
  };
  logo.src = teamBadgeUrl;
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
      map: nasaSource ? teamFlagTexture() : null,
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
