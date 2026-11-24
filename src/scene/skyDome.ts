import * as THREE from 'three';

export interface AtmosphericSkyUniforms {
  [uniform: string]: THREE.IUniform<unknown>;
  uTime: THREE.IUniform<number>;
  uCloudOffset: THREE.IUniform<THREE.Vector2>;
  uSunDir: THREE.IUniform<THREE.Vector3>;
  uMoonDir: THREE.IUniform<THREE.Vector3>;
  uZenithColor: THREE.IUniform<THREE.Color>;
  uHorizonColor: THREE.IUniform<THREE.Color>;
  uSunGlowColor: THREE.IUniform<THREE.Color>;
  uCloudLightColor: THREE.IUniform<THREE.Color>;
  uCloudShadowColor: THREE.IUniform<THREE.Color>;
  uCloudCover: THREE.IUniform<number>;
  uHazeFactor: THREE.IUniform<number>;
  uNightFactor: THREE.IUniform<number>;
  uTwilightFactor: THREE.IUniform<number>;
  uRainFactor: THREE.IUniform<number>;
  uStormFactor: THREE.IUniform<number>;
  uLightningFlash: THREE.IUniform<number>;
}

const SKY_VERTEX_SHADER = /* glsl */ `
  varying vec3 vWorldDir;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldDir = position;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const SKY_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform vec2 uCloudOffset;
  uniform vec3 uSunDir;
  uniform vec3 uMoonDir;
  uniform vec3 uZenithColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uSunGlowColor;
  uniform vec3 uCloudLightColor;
  uniform vec3 uCloudShadowColor;
  uniform float uCloudCover;
  uniform float uHazeFactor;
  uniform float uNightFactor;
  uniform float uTwilightFactor;
  uniform float uRainFactor;
  uniform float uStormFactor;
  uniform float uLightningFlash;

  varying vec3 vWorldDir;

  float hash21(vec2 p) {
    p = fract(p * vec2(234.34, 435.345));
    p += dot(p, p + 34.23);
    return fract(p.x * p.y);
  }

  float hash31(vec3 p) {
    p = fract(p * vec3(443.897, 441.423, 437.195));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
  }

  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbmClouds(vec2 p) {
    float v = 0.0;
    float amp = 0.52;
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 4; i++) {
      v += amp * noise2(p);
      p = rot * p * 2.04 + vec2(11.3, 7.1);
      amp *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize(vWorldDir);
    float elev = clamp(dir.y, 0.0, 1.0);

    // 1. Physically-inspired Rayleigh gradient from horizon to zenith
    float skyCurve = pow(elev, 0.48);
    vec3 skyCol = mix(uHorizonColor, uZenithColor, skyCurve);

    // 2. Solar Mie forward scattering + golden-hour horizon bloom
    vec3 sunDir = normalize(uSunDir);
    float sunDot = max(dot(dir, sunDir), 0.0);
    float sunAbove = smoothstep(-0.18, 0.16, sunDir.y);

    float wideMie = pow(sunDot, 4.0) * (0.28 + 0.45 * uTwilightFactor + 0.25 * uHazeFactor);
    float tightMie = pow(sunDot, 28.0) * (0.55 + 0.4 * uTwilightFactor);
    float horizonGlowBand = exp(-elev * 6.5) * (0.35 + 0.65 * uTwilightFactor) * (0.35 + 0.65 * pow(sunDot, 2.0));

    float clearAtten = (1.0 - 0.72 * uStormFactor) * (1.0 - 0.55 * uRainFactor);
    skyCol += uSunGlowColor * (wideMie + tightMie + horizonGlowBand) * sunAbove * clearAtten;

    // 3. Crisp Sun Disc (attenuated gently near horizon and by overcast)
    float sunVisibility = smoothstep(-0.02, 0.06, sunDir.y) * (1.0 - 0.88 * uCloudCover * uCloudCover) * (1.0 - 0.9 * uRainFactor);
    float sunDisc = smoothstep(0.99925, 0.99982, dot(dir, sunDir));
    skyCol += uSunGlowColor * sunDisc * 3.2 * sunVisibility;

    // 4. Night Moon Disc, Lunar Halo & Twinkling Starfield
    vec3 moonDir = normalize(uMoonDir);
    float moonDot = max(dot(dir, moonDir), 0.0);
    float moonVis = uNightFactor * smoothstep(-0.04, 0.08, dir.y) * (1.0 - 0.85 * uStormFactor) * (1.0 - 0.75 * uRainFactor);
    float moonHalo = pow(moonDot, 22.0) * 0.22 + pow(moonDot, 140.0) * 0.55;
    float moonDisc = smoothstep(0.99945, 0.99978, dot(dir, moonDir));
    skyCol += vec3(0.62, 0.74, 0.92) * moonHalo * moonVis;
    skyCol += vec3(0.92, 0.95, 1.0) * moonDisc * 1.45 * moonVis * (1.0 - 0.8 * uCloudCover);

    float starVis = uNightFactor * smoothstep(0.05, 0.35, elev) * (1.0 - smoothstep(0.35, 0.88, uCloudCover)) * (1.0 - uRainFactor);
    if (starVis > 0.01) {
      vec3 starGrid = floor(dir * 260.0);
      float rnd = hash31(starGrid);
      if (rnd > 0.992) {
        vec3 cellCenter = normalize(starGrid + 0.5);
        float d = length(dir - cellCenter) * 260.0;
        float twinkle = 0.65 + 0.35 * sin(uTime * (1.8 + rnd * 4.0) + rnd * 62.0);
        float star = smoothstep(0.45, 0.02, d) * twinkle;
        skyCol += vec3(0.85, 0.91, 1.0) * star * 1.15 * starVis;
      }
    }

    // 5. Perspective-Projected FBM Cloud Strata (above horizon)
    if (dir.y > 0.005 && uCloudCover > 0.04) {
      // Gently curved atmospheric shell projection for realistic horizon recession
      vec2 cloudPlaneUv = dir.xz / (dir.y + 0.14);
      float macro = fbmClouds(cloudPlaneUv * 0.42 + uCloudOffset);
      float detail = fbmClouds(cloudPlaneUv * 1.35 - uCloudOffset * 0.45 + vec2(3.7, 1.9));
      float cloudField = macro * 0.72 + detail * 0.28;

      // Map real cloudCover (0..1) cleanly to cloud threshold
      float threshold = mix(0.82, 0.24, clamp(uCloudCover, 0.0, 1.0));
      float density = smoothstep(threshold - 0.14, threshold + 0.22, cloudField);
      // Softly thicken near overcast/rain
      density = clamp(density * (0.65 + 0.55 * uCloudCover), 0.0, 0.97);

      // Sun silver-lining & base shading
      float lightSample = fbmClouds(cloudPlaneUv * 0.42 + uCloudOffset + sunDir.xz * 0.07);
      float sunFacing = clamp(0.5 + 2.4 * (cloudField - lightSample), 0.0, 1.0);
      float silverLining = pow(sunDot, 8.0) * (1.0 - density * 0.65) * sunAbove * (1.0 - 0.7 * uStormFactor);

      vec3 cloudBase = mix(uCloudShadowColor, uCloudLightColor, sunFacing);
      cloudBase += uSunGlowColor * silverLining * 0.9;
      cloudBase += vec3(0.75, 0.85, 1.0) * uLightningFlash * (0.4 + 0.6 * (1.0 - density));

      // Fade clouds smoothly into the distant horizon haze so there is no hard cutoff
      float horizonFade = smoothstep(0.008, 0.14, dir.y);
      float cloudAlpha = density * horizonFade * (1.0 - 0.35 * uHazeFactor);
      skyCol = mix(skyCol, cloudBase, cloudAlpha);
    }

    // 6. Distant atmospheric mist veil right at the horizon line (matches FogExp2)
    float mistBand = exp(-elev * mix(16.0, 5.5, uHazeFactor));
    skyCol = mix(skyCol, uHorizonColor, mistBand * (0.35 + 0.55 * uHazeFactor));

    // Lightning sky illumination
    skyCol += vec3(0.55, 0.68, 0.92) * uLightningFlash * 0.35;

    // Ensure ground hemisphere below horizon matches horizon fog cleanly
    if (dir.y < 0.0) {
      skyCol = uHorizonColor;
    }

    gl_FragColor = vec4(skyCol, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createAtmosphericSkyDome(): {
  mesh: THREE.Mesh;
  uniforms: AtmosphericSkyUniforms;
} {
  const uniforms: AtmosphericSkyUniforms = {
    uTime: { value: 0 },
    uCloudOffset: { value: new THREE.Vector2(0, 0) },
    uSunDir: { value: new THREE.Vector3(0.4, 0.5, -0.76).normalize() },
    uMoonDir: { value: new THREE.Vector3(-0.4, 0.45, -0.78).normalize() },
    uZenithColor: { value: new THREE.Color(0x2868b8) },
    uHorizonColor: { value: new THREE.Color(0x9bc7eb) },
    uSunGlowColor: { value: new THREE.Color(0xffe1b0) },
    uCloudLightColor: { value: new THREE.Color(0xf8fafc) },
    uCloudShadowColor: { value: new THREE.Color(0x93a5bc) },
    uCloudCover: { value: 0.35 },
    uHazeFactor: { value: 0.2 },
    uNightFactor: { value: 0.0 },
    uTwilightFactor: { value: 0.0 },
    uRainFactor: { value: 0.0 },
    uStormFactor: { value: 0.0 },
    uLightningFlash: { value: 0.0 },
  };

  const geometry = new THREE.SphereGeometry(165, 48, 32);
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SKY_VERTEX_SHADER,
    fragmentShader: SKY_FRAGMENT_SHADER,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

function parseIsoMinutes(iso?: string): number | null {
  if (!iso || !iso.includes('T')) return null;
  const timePart = iso.split('T')[1];
  const [hStr, mStr] = timePart.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export interface RealSolarAngles {
  sunDir: THREE.Vector3;
  moonDir: THREE.Vector3;
  sunElevationRad: number;
  twilightFactor: number;
  nightFactor: number;
}

export function computeRealSolarAngles(
  isDay: boolean,
  observationTimeIso?: string,
  sunriseIso?: string,
  sunsetIso?: string,
  outSunDir = new THREE.Vector3(),
  outMoonDir = new THREE.Vector3()
): RealSolarAngles {
  const obsMin = parseIsoMinutes(observationTimeIso);
  const riseMin = parseIsoMinutes(sunriseIso) ?? 390; // 6:30 AM fallback
  const setMin = parseIsoMinutes(sunsetIso) ?? 1080; // 6:00 PM fallback
  const daySpan = Math.max(setMin - riseMin, 120);

  let sunElevationRad = isDay ? 0.58 : -0.35;
  let sunAzimuthRad = isDay ? 0.25 : 1.35;

  if (obsMin !== null) {
    const progress = (obsMin - riseMin) / daySpan;
    if (progress >= -0.08 && progress <= 1.08) {
      // Sun arcs across visible -Z horizon from sunrise (-0.78 rad, left) to sunset (+0.12 rad, right)
      const clampedP = THREE.MathUtils.clamp(progress, 0, 1);
      sunAzimuthRad = THREE.MathUtils.lerp(-0.78, 0.12, THREE.MathUtils.clamp(progress, -0.08, 1.08));
      if (progress >= 0 && progress <= 1) {
        sunElevationRad = Math.sin(clampedP * Math.PI) * 0.76 + 0.12;
      } else {
        // Civil twilight right before sunrise or right after sunset
        const distOut = progress < 0 ? -progress : progress - 1;
        sunElevationRad = THREE.MathUtils.lerp(0.12, -0.1, distOut / 0.08);
      }
    } else {
      // Nighttime
      sunElevationRad = -0.32;
      sunAzimuthRad = progress < 0 ? -0.92 : 0.28;
    }
  } else if (!isDay) {
    sunElevationRad = -0.32;
  }

  const cosE = Math.cos(sunElevationRad);
  outSunDir
    .set(
      Math.sin(sunAzimuthRad) * cosE,
      Math.sin(sunElevationRad),
      -Math.cos(sunAzimuthRad) * cosE
    )
    .normalize();

  // Moon arcs across the visible sky during night hours
  let moonProgress = 0.5;
  if (obsMin !== null) {
    const nightSpan = Math.max(1440 - daySpan, 120);
    const sinceSet = obsMin >= setMin ? obsMin - setMin : obsMin + (1440 - setMin);
    moonProgress = THREE.MathUtils.clamp(sinceSet / nightSpan, 0, 1);
  }
  const moonAzimuth = THREE.MathUtils.lerp(-0.75, 0.15, moonProgress);
  const moonElev = isDay ? -0.25 : Math.sin(moonProgress * Math.PI) * 0.55 + 0.2;
  const cosM = Math.cos(moonElev);
  outMoonDir
    .set(
      Math.sin(moonAzimuth) * cosM,
      Math.sin(moonElev),
      -Math.cos(moonAzimuth) * cosM
    )
    .normalize();

  const twilightFactor =
    1 - THREE.MathUtils.smoothstep(Math.abs(sunElevationRad - 0.04), 0.0, 0.26);
  const nightFactor = 1 - THREE.MathUtils.smoothstep(sunElevationRad, -0.12, 0.08);

  return {
    sunDir: outSunDir,
    moonDir: outMoonDir,
    sunElevationRad,
    twilightFactor: THREE.MathUtils.clamp(twilightFactor, 0, 1),
    nightFactor: THREE.MathUtils.clamp(nightFactor, 0, 1),
  };
}
