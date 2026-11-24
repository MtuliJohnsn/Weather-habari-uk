import * as THREE from 'three';
import { ProceduralTextureSet } from './textures';

export function groundHeightAt(x: number, z: number): number {
  const dist = Math.hypot(x, z);
  // Keep central observatory pad level within radius 2.6
  const flatFactor = THREE.MathUtils.smoothstep(dist, 2.4, 8.0);
  const rolling =
    Math.sin(x * 0.14) * Math.cos(z * 0.13) * 1.1 +
    Math.sin(x * 0.055 + 1.2) * 1.25 +
    Math.cos(z * 0.07 - 0.6) * 0.85;

  // Distant foothills & mountain ridgeline around the perimeter (r = 32..115)
  const theta = Math.atan2(z, x);
  const mountainMask = THREE.MathUtils.smoothstep(dist, 28, 92);
  const ridgeProfile =
    0.55 +
    0.28 * Math.sin(theta * 3.0 + 0.6) +
    0.18 * Math.cos(theta * 5.0 - 1.1) +
    0.12 * Math.sin(theta * 9.0 + 2.3);
  const crags =
    Math.abs(Math.sin(x * 0.045 + z * 0.03) * Math.cos(z * 0.042 - x * 0.02)) * 6.5;
  const mountains = mountainMask * (12.5 * ridgeProfile + crags);

  return (rolling + mountains) * flatFactor;
}

export function createTerrainMesh(textures: ProceduralTextureSet): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(240, 240, 140, 140);
  geometry.rotateX(-Math.PI / 2);

  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const lowColor = new THREE.Color('#426140');
  const midColor = new THREE.Color('#53734c');
  const alpineColor = new THREE.Color('#5e6d63');
  const peakColor = new THREE.Color('#6b757d');
  const tmpColor = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = groundHeightAt(x, z);
    pos.setY(i, y);

    const t = THREE.MathUtils.clamp((y + 1.0) / 14.0, 0, 1);
    if (t < 0.28) {
      tmpColor.lerpColors(lowColor, midColor, t / 0.28);
    } else if (t < 0.65) {
      tmpColor.lerpColors(midColor, alpineColor, (t - 0.28) / 0.37);
    } else {
      tmpColor.lerpColors(alpineColor, peakColor, (t - 0.65) / 0.35);
    }
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    map: textures.terrainAlbedo,
    roughnessMap: textures.terrainRoughness,
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.02,
  });

  const terrain = new THREE.Mesh(geometry, material);
  terrain.receiveShadow = true;
  terrain.castShadow = false;
  return terrain;
}

export interface WeatherStationHandles {
  root: THREE.Group;
  anemometerRotor: THREE.Group;
  windVanePivot: THREE.Group;
  beaconMaterial: THREE.MeshStandardMaterial;
  solarGlassMaterial: THREE.MeshPhysicalMaterial;
  concreteMaterial: THREE.MeshStandardMaterial;
}

export function createWeatherStationGroup(
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean
): WeatherStationHandles {
  const root = new THREE.Group();
  root.position.set(0, groundHeightAt(0, 0), 0);

  // Materials with distinct roughness (>= 0.25 contrast) & metalness
  const concreteMat = new THREE.MeshStandardMaterial({
    map: textures.concreteAlbedo,
    color: 0xb7c0c9,
    roughness: 0.92,
    metalness: 0.04,
  });
  const steelFlangeMat = new THREE.MeshStandardMaterial({
    color: 0x3b4754,
    roughness: 0.48,
    metalness: 0.72,
    roughnessMap: textures.brushedMetalRoughness,
  });
  const aluminumMat = new THREE.MeshStandardMaterial({
    color: 0xdce3ea,
    roughness: 0.24,
    metalness: 0.88,
    roughnessMap: textures.brushedMetalRoughness,
  });
  const whiteSensorMat = new THREE.MeshStandardMaterial({
    color: 0xf4f7fa,
    roughness: 0.42,
    metalness: 0.06,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xc99c4e,
    roughness: 0.22,
    metalness: 0.92,
    roughnessMap: textures.brushedMetalRoughness,
  });
  const solarCellMat = new THREE.MeshStandardMaterial({
    map: textures.solarAlbedo,
    roughness: 0.18,
    metalness: 0.45,
  });
  const solarGlassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xd9ecff,
    roughness: 0.06,
    metalness: 0.05,
    transmission: isSoftwareGl ? 0 : 0.7,
    transparent: true,
    opacity: isSoftwareGl ? 0.28 : 0.9,
    ior: 1.52,
    clearcoat: 1.0,
    depthWrite: false,
  });
  const beaconMaterial = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    emissive: new THREE.Color(0x10b981),
    emissiveIntensity: 1.6,
    roughness: 0.2,
    metalness: 0.1,
  });

  // 1. Beveled octagonal concrete foundation pad (ExtrudeGeometry)
  const octShape = new THREE.Shape();
  const padRadius = 1.65;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const px = Math.cos(a) * padRadius;
    const py = Math.sin(a) * padRadius;
    if (i === 0) octShape.moveTo(px, py);
    else octShape.lineTo(px, py);
  }
  octShape.closePath();

  const padGeo = new THREE.ExtrudeGeometry(octShape, {
    depth: 0.16,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.06,
    bevelSegments: 2,
  });
  padGeo.rotateX(-Math.PI / 2);
  const padMesh = new THREE.Mesh(padGeo, concreteMat);
  padMesh.position.y = 0.02;
  padMesh.castShadow = true;
  padMesh.receiveShadow = true;
  root.add(padMesh);

  // Soft radial contact shadow plane right beneath pad
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(5.4, 5.4),
    new THREE.MeshBasicMaterial({
      map: textures.contactShadow,
      transparent: true,
      depthWrite: false,
      opacity: 0.48,
    })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.015;
  root.add(shadowPlane);

  // 2. Stepped steel mounting collar (LatheGeometry)
  const collarPoints = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.46, 0.0),
    new THREE.Vector2(0.46, 0.08),
    new THREE.Vector2(0.32, 0.12),
    new THREE.Vector2(0.24, 0.34),
    new THREE.Vector2(0.14, 0.38),
    new THREE.Vector2(0.14, 0.0),
  ];
  const collarGeo = new THREE.LatheGeometry(collarPoints, 24);
  const collarMesh = new THREE.Mesh(collarGeo, steelFlangeMat);
  collarMesh.position.y = 0.22;
  collarMesh.castShadow = true;
  collarMesh.receiveShadow = true;
  root.add(collarMesh);

  // 3. Main anodized aluminum mast + crossbars
  const mastMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.115, 4.35, 20),
    aluminumMat
  );
  mastMesh.position.y = 0.22 + 4.35 / 2;
  mastMesh.castShadow = true;
  root.add(mastMesh);

  // Upper horizontal instrument cross-arm
  const crossArm = new THREE.Mesh(
    new THREE.CylinderGeometry(0.036, 0.036, 2.05, 16),
    aluminumMat
  );
  crossArm.rotation.z = Math.PI / 2;
  crossArm.position.set(0, 4.1, 0);
  crossArm.castShadow = true;
  root.add(crossArm);

  // 4. Photovoltaic Solar Panel Assembly (tilted toward sun)
  const solarGroup = new THREE.Group();
  solarGroup.position.set(0, 2.25, 0.24);
  solarGroup.rotation.x = Math.PI * 0.22;

  const panelFrame = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.05, 0.82), steelFlangeMat);
  panelFrame.castShadow = true;
  solarGroup.add(panelFrame);

  const panelCellFace = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.02, 0.72), solarCellMat);
  panelCellFace.position.y = 0.028;
  solarGroup.add(panelCellFace);

  const panelGlass = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.015, 0.74), solarGlassMaterial);
  panelGlass.position.y = 0.042;
  panelGlass.renderOrder = 2;
  solarGroup.add(panelGlass);

  // Mounting strut connecting panel to mast
  const solarStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.36, 12), steelFlangeMat);
  solarStrut.position.set(0, 2.25, 0.12);
  solarStrut.rotation.x = Math.PI / 2;
  root.add(solarStrut);
  root.add(solarGroup);

  // 5. Louvered Stevenson Radiation Shield (5 stacked louver plates + domed cap)
  const shieldGroup = new THREE.Group();
  shieldGroup.position.set(-0.62, 2.95, 0);

  const shieldArm = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.62, 12), aluminumMat);
  shieldArm.rotation.z = Math.PI / 2;
  shieldArm.position.set(0.31, 0, 0);
  shieldGroup.add(shieldArm);

  for (let i = 0; i < 5; i++) {
    const fin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.29, 0.055, 24),
      whiteSensorMat
    );
    fin.position.y = -0.14 + i * 0.085;
    fin.castShadow = true;
    shieldGroup.add(fin);
  }
  const shieldCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.5),
    whiteSensorMat
  );
  shieldCap.position.y = 0.25;
  shieldCap.castShadow = true;
  shieldGroup.add(shieldCap);
  root.add(shieldGroup);

  // 6. Rotating 3-Cup Anemometer Assembly (on left side of upper cross-arm)
  const anemometerBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.065, 0.24, 16),
    steelFlangeMat
  );
  anemometerBase.position.set(-0.98, 4.22, 0);
  root.add(anemometerBase);

  const anemometerRotor = new THREE.Group();
  anemometerRotor.position.set(-0.98, 4.38, 0);

  const rotorHub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.07, 16), aluminumMat);
  anemometerRotor.add(rotorHub);

  // Cup profile via LatheGeometry
  const cupGeo = new THREE.SphereGeometry(0.11, 16, 12, 0, Math.PI);
  for (let i = 0; i < 3; i++) {
    const armHolder = new THREE.Group();
    armHolder.rotation.y = (i * Math.PI * 2) / 3;

    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 8), aluminumMat);
    arm.rotation.z = Math.PI / 2;
    arm.position.x = 0.21;
    armHolder.add(arm);

    const cup = new THREE.Mesh(cupGeo, brassMat);
    cup.position.set(0.42, 0, 0);
    cup.rotation.y = Math.PI / 2;
    cup.castShadow = true;
    armHolder.add(cup);

    anemometerRotor.add(armHolder);
  }
  root.add(anemometerRotor);

  // 7. Directional Wind Vane (on right side of upper cross-arm)
  const vaneStem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.045, 0.26, 14),
    steelFlangeMat
  );
  vaneStem.position.set(0.98, 4.23, 0);
  root.add(vaneStem);

  const windVanePivot = new THREE.Group();
  windVanePivot.position.set(0.98, 4.38, 0);

  const vaneShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.72, 10),
    aluminumMat
  );
  vaneShaft.rotation.x = Math.PI / 2;
  windVanePivot.add(vaneShaft);

  // Arrow head (ExtrudeGeometry)
  const arrowShape = new THREE.Shape();
  arrowShape.moveTo(0, 0.16);
  arrowShape.lineTo(0.07, -0.04);
  arrowShape.lineTo(-0.07, -0.04);
  arrowShape.closePath();
  const arrowGeo = new THREE.ExtrudeGeometry(arrowShape, {
    depth: 0.02,
    bevelEnabled: true,
    bevelSize: 0.005,
    bevelThickness: 0.005,
  });
  arrowGeo.rotateX(Math.PI / 2);
  const arrowHead = new THREE.Mesh(arrowGeo, brassMat);
  arrowHead.position.set(0, 0.01, 0.34);
  windVanePivot.add(arrowHead);

  // Tail fin
  const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.18, 0.22), brassMat);
  tailFin.position.set(0, 0.04, -0.32);
  windVanePivot.add(tailFin);
  root.add(windVanePivot);

  // 8. Brushed Brass Rain Gauge Cylinder on foundation pad
  const rainGaugeGroup = new THREE.Group();
  rainGaugeGroup.position.set(0.92, 0.22, 0.65);
  const gaugeBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 0.68, 20),
    brassMat
  );
  gaugeBody.position.y = 0.34;
  gaugeBody.castShadow = true;
  rainGaugeGroup.add(gaugeBody);

  const gaugeRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.16, 0.018, 12, 24),
    aluminumMat
  );
  gaugeRim.rotation.x = Math.PI / 2;
  gaugeRim.position.y = 0.68;
  rainGaugeGroup.add(gaugeRim);
  root.add(rainGaugeGroup);

  // 9. Top Mast Beacon Housing & Status Lens
  const beaconBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.11, 0.16, 16),
    steelFlangeMat
  );
  beaconBase.position.y = 4.63;
  root.add(beaconBase);

  const beaconLens = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 20, 14),
    beaconMaterial
  );
  beaconLens.position.y = 4.76;
  root.add(beaconLens);

  return {
    root,
    anemometerRotor,
    windVanePivot,
    beaconMaterial,
    solarGlassMaterial,
    concreteMaterial: concreteMat,
  };
}

export interface TreeInstanceRef {
  group: THREE.Group;
  baseTiltX: number;
  baseTiltZ: number;
  phase: number;
}

export function createPineForest(): { forestGroup: THREE.Group; trees: TreeInstanceRef[] } {
  const forestGroup = new THREE.Group();
  const trees: TreeInstanceRef[] = [];

  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x5c4033,
    roughness: 0.92,
    metalness: 0.02,
  });
  const foliageDarkMat = new THREE.MeshStandardMaterial({
    color: 0x2c553b,
    roughness: 0.85,
    metalness: 0.02,
  });
  const foliageLightMat = new THREE.MeshStandardMaterial({
    color: 0x3b6d4a,
    roughness: 0.82,
    metalness: 0.02,
  });

  const trunkGeo = new THREE.CylinderGeometry(0.1, 0.2, 1.35, 8);
  const cone1Geo = new THREE.ConeGeometry(1.15, 1.7, 9);
  const cone2Geo = new THREE.ConeGeometry(0.88, 1.45, 9);
  const cone3Geo = new THREE.ConeGeometry(0.58, 1.15, 9);
  const rootBaseGeo = new THREE.CylinderGeometry(0.22, 0.34, 0.25, 8);

  const placements: Array<[number, number, number]> = [
    [-7.2, -5.8, 1.15],
    [-10.4, -2.2, 0.95],
    [-8.5, 4.6, 1.28],
    [-13.2, 7.8, 1.05],
    [7.8, -6.4, 1.22],
    [11.4, -1.8, 0.92],
    [9.2, 6.1, 1.32],
    [14.2, -8.5, 1.4],
    [-4.8, -11.5, 1.12],
    [4.4, -12.6, 1.02],
    [-15.5, -10.5, 1.35],
    [15.8, 10.2, 1.18],
    [-14.2, 14.5, 1.25],
    [12.4, 14.8, 0.98],
  ];

  placements.forEach(([x, z, scale], idx) => {
    const group = new THREE.Group();
    const y = groundHeightAt(x, z);
    group.position.set(x, y - 0.05, z);
    group.scale.setScalar(scale);
    group.rotation.y = (idx * 1.7) % (Math.PI * 2);

    const rootBase = new THREE.Mesh(rootBaseGeo, trunkMat);
    rootBase.position.y = 0.125;
    rootBase.castShadow = true;
    rootBase.receiveShadow = true;
    group.add(rootBase);

    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.72;
    trunk.castShadow = true;
    group.add(trunk);

    const tier1 = new THREE.Mesh(cone1Geo, idx % 2 === 0 ? foliageDarkMat : foliageLightMat);
    tier1.position.y = 1.65;
    tier1.castShadow = true;
    tier1.receiveShadow = true;
    group.add(tier1);

    const tier2 = new THREE.Mesh(cone2Geo, idx % 2 === 0 ? foliageLightMat : foliageDarkMat);
    tier2.position.y = 2.48;
    tier2.rotation.y = 0.4;
    tier2.castShadow = true;
    group.add(tier2);

    const tier3 = new THREE.Mesh(cone3Geo, foliageLightMat);
    tier3.position.y = 3.22;
    tier3.rotation.y = 0.9;
    tier3.castShadow = true;
    group.add(tier3);

    forestGroup.add(group);
    trees.push({
      group,
      baseTiltX: (Math.random() - 0.5) * 0.02,
      baseTiltZ: (Math.random() - 0.5) * 0.02,
      phase: idx * 0.85,
    });
  });

  return { forestGroup, trees };
}

export function createInstancedBoulders(): THREE.InstancedMesh {
  const geo = new THREE.DodecahedronGeometry(0.45, 1);
  // Slightly flatten bottom so rocks sit naturally
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 0) pos.setY(i, y * 0.45);
  }
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0.04,
  });

  const count = 34;
  const instanced = new THREE.InstancedMesh(geo, mat, count);
  instanced.castShadow = true;
  instanced.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const palette = [0x6e7780, 0x7d858e, 0x5c646d, 0x878d91];

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (i % 3) * 0.37;
    const radius = 3.8 + ((i * 7) % 19);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = groundHeightAt(x, z);

    dummy.position.set(x, y + 0.04, z);
    const s = 0.65 + ((i * 13) % 10) * 0.085;
    dummy.scale.set(s * 1.15, s * 0.72, s);
    dummy.rotation.set((i % 5) * 0.12, angle, (i % 3) * 0.1);
    dummy.updateMatrix();
    instanced.setMatrixAt(i, dummy.matrix);

    color.setHex(palette[i % palette.length]);
    instanced.setColorAt(i, color);
  }

  instanced.instanceMatrix.needsUpdate = true;
  if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
  instanced.computeBoundingSphere();
  return instanced;
}
