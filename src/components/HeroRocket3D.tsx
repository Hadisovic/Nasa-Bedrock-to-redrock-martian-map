import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { loadRocket } from "../explorer/markers.ts";
import { PixelRocket } from "./HeroArt.tsx";

/**
 * Renders the team-supplied rocket model as a still hero image: transparent background, the
 * same upper-right key light as the painted scene, three-quarter view. It draws only after
 * loading and on resize (no animation loop), and keeps the pixel rocket if WebGL fails.
 */
export function HeroRocket3D({ className }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const element = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute("aria-hidden", "true");
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(-0.9, 0.8, 2.25);
    camera.lookAt(0, 0.47, 0);
    scene.add(new THREE.HemisphereLight(0xffe2cf, 0x3a1610, 1.3));
    const key = new THREE.DirectionalLight(0xffd2b0, 2.4);
    key.position.set(3, 4, 2);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x6bd6ff, 0.6);
    rim.position.set(-3, 1, -2);
    scene.add(rim);
    let live = true;
    const draw = () => {
      const width = element.clientWidth, height = element.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    loadRocket().then((template) => {
      if (!live) return;
      const rocket = template.clone(true);
      rocket.rotation.y = -0.5;
      scene.add(rocket);
      draw();
      setReady(true);
    }, () => {});
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    return () => {
      live = false;
      observer.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div ref={host} className={`${className ?? ""} hero-rocket${ready ? " hero-rocket--ready" : ""}`}>
      {!ready && <PixelRocket className="hero-rocket__fallback" />}
    </div>
  );
}
