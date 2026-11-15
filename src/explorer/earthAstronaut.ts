import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import astronautUrl from "../assets/models/space-astronaut.glb?url";
import roverUrl from "../assets/models/perseverance-nasa.glb?url";
import { latLonToUnit, lonDelta } from "./geo.ts";
import type { WalkPose } from "./earthWalk.ts";
import type { LatLon } from "./geo.ts";

export async function loadEarthAstronaut(rover = false) {
  const { scene, animations } = await new GLTFLoader().loadAsync(rover ? roverUrl : astronautUrl);
  const model = new THREE.Group();
  model.name = rover ? "Perseverance route preview" : "Astronaut route preview";
  if (rover) {
    const bounds = new THREE.Box3().setFromObject(scene);
    const center = bounds.getCenter(new THREE.Vector3());
    const scale = 1.8 / Math.max(0.01, bounds.max.y - bounds.min.y);
    scene.scale.setScalar(scale);
    scene.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  }
  model.add(scene);
  const mixer = new THREE.AnimationMixer(scene);
  const clip = THREE.AnimationClip.findByName(animations, "Walk");
  const walk = clip ? mixer.clipAction(clip) : null;
  model.traverse((object) => { if (object instanceof THREE.Mesh) object.renderOrder = 110; });
  const up = new THREE.Vector3(), right = new THREE.Vector3(), forward = new THREE.Vector3();
  const screenUp = new THREE.Vector3(), toCamera = new THREE.Vector3();
  const basis = new THREE.Matrix4(), tilt = new THREE.Quaternion();
  let heading: number | undefined;
  let playing = false;

  return { model, update(pose: WalkPose, position: LatLon, dt: number, camera: THREE.PerspectiveCamera, height: number,
    surface: (point: LatLon, lift?: number) => THREE.Vector3) {
    if (playing !== pose.moving) {
      playing = pose.moving;
      if (playing) walk?.play(); else walk?.stop();
    }
    mixer.update(dt);
    heading ??= pose.heading;
    heading += lonDelta(heading, pose.heading) * Math.min(1, dt * 12);
    const { lat, lon } = position;
    const a = THREE.MathUtils.degToRad(heading);
    const p = THREE.MathUtils.degToRad(lat), l = THREE.MathUtils.degToRad(lon);
    up.set(...latLonToUnit(position));
    forward.set(-Math.sin(p) * Math.cos(l), Math.cos(p), Math.sin(p) * Math.sin(l))
      .multiplyScalar(Math.cos(a)).addScaledVector(right.set(-Math.sin(l), 0, -Math.cos(l)), Math.sin(a));
    right.crossVectors(up, forward).normalize();
    model.position.copy(surface(position, 1));
    toCamera.copy(camera.position).sub(model.position);
    const depth = -camera.getWorldDirection(screenUp).dot(toCamera);
    model.visible = depth > 0 && toCamera.normalize().dot(up) > 0.05;
    model.scale.setScalar(Math.max(0, depth * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (rover ? 58 : 42) / (height * 1.8)));
    screenUp.set(0, 1, 0).applyQuaternion(camera.quaternion).lerp(up, 0.24).normalize();
    model.quaternion.setFromRotationMatrix(basis.makeBasis(right, up, forward)).premultiply(tilt.setFromUnitVectors(up, screenUp));
  }, dispose() {
    mixer.stopAllAction(); mixer.uncacheRoot(scene);
    model.removeFromParent();
    const textures = new Set<THREE.Texture>();
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials: THREE.MeshStandardMaterial[] = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        for (const candidate of [material.map, material.normalMap, material.roughnessMap, material.metalnessMap,
          material.aoMap, material.emissiveMap]) if (candidate) textures.add(candidate);
        material.dispose();
      }
    });
    for (const texture of textures) {
      if (texture.image instanceof ImageBitmap) texture.image.close();
      texture.dispose();
    }
  } };
}
