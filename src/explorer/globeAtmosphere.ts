import * as THREE from "three";

// The two atmosphere passes and star palette come from the Frontend globe.
export function createAtmosphere() {
  const group = new THREE.Group();
  const sunDirection = { value: new THREE.Vector3() };
  const atlasLighting = { value: 0 };
  for (const outer of [true, false]) {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        sunDirection, atlasLighting,
        hazeColor: { value: new THREE.Color(outer ? "#f09265" : "#d47754") },
        twilightColor: { value: new THREE.Color("#6c608f") },
      },
      defines: { OUTER_HALO: outer ? 1 : 0 },
      vertexShader: `
        varying vec3 surfaceNormal;
        varying vec3 worldPosition;
        void main() {
          surfaceNormal = normalize(mat3(modelMatrix) * normal);
          worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * viewMatrix * vec4(worldPosition, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 sunDirection;
        uniform vec3 hazeColor;
        uniform vec3 twilightColor;
        uniform float atlasLighting;
        varying vec3 surfaceNormal;
        varying vec3 worldPosition;
        void main() {
          vec3 viewDirection = normalize(cameraPosition - worldPosition);
          vec3 normal = normalize(surfaceNormal);
          float rim = 1.0 - max(dot(viewDirection, normal), 0.0);
          float sunDot = dot(normal, sunDirection);
          float day = smoothstep(-0.25, 0.4, sunDot);
          #if OUTER_HALO == 1
            float scatter = pow(max(dot(viewDirection, -sunDirection), 0.0), 3.8) * 0.35;
            float halo = pow(rim, 4.2) * 1.15;
            vec3 tint = mix(twilightColor, hazeColor, smoothstep(-0.2, 0.28, sunDot));
            tint = mix(vec3(0.14, 0.22, 0.43), tint * (1.1 + scatter * 0.6), day);
            float opacity = halo * (0.25 + day * 0.75) + scatter * day + pow(rim, 3.2) * 0.35;
            float atlasOpacity = halo * 1.15 + pow(rim, 3.0) * 0.3;
            gl_FragColor = vec4(mix(tint, hazeColor, atlasLighting), clamp(mix(opacity, atlasOpacity, atlasLighting), 0.0, 1.0) * 0.65);
          #else
            gl_FragColor = vec4(hazeColor, pow(rim, 4.2) * (mix(day, 1.0, atlasLighting) * 0.42 + 0.12));
          #endif
        }
      `,
      side: outer ? THREE.BackSide : THREE.FrontSide,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false,
    });
    group.add(new THREE.Mesh(new THREE.SphereGeometry(outer ? 1.022 : 1.006, 64, 48), material));
  }
  return { group, sunDirection, atlasLighting };
}

export function createStarfield() {
  const count = 4300;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const palette = ["#e8ecf8", "#fff2e0", "#9bb4df", "#f0c4a8"].map((color) => new THREE.Color(color));
  const sizes = new Float32Array(count);
  let seed = 37;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    const radius = 34;
    const azimuth = random() * Math.PI * 2;
    const up = i < 1600 ? ((random() + random()) - 1) * 0.23 + Math.sin(azimuth + 1.4) * .31 : 2 * random() - 1;
    const ring = radius * Math.sqrt(1 - up * up);
    positions.set([ring * Math.cos(azimuth), radius * up, ring * Math.sin(azimuth)], i * 3);
    const { r, g, b } = palette[i % palette.length];
    const brightness = .22 + .78 * random() ** 4;
    colors.set([r * brightness, g * brightness, b * brightness], i * 3);
    sizes[i] = .9 + 3.3 * brightness;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  return new THREE.Points(geometry, new THREE.ShaderMaterial({
    vertexColors: true, transparent: true, depthWrite: false, toneMapped: false,
    vertexShader: `
      attribute float size;
      varying vec3 starlight;
      void main() {
        starlight = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size;
      }
    `,
    fragmentShader: `
      varying vec3 starlight;
      void main() {
        float radius = length(gl_PointCoord - 0.5) * 2.0;
        float glow = exp(-4.5 * radius * radius) * (1.0 - smoothstep(0.74, 1.0, radius));
        gl_FragColor = vec4(starlight, glow);
        #include <colorspace_fragment>
      }
    `,
  }));
}
