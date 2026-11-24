import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  createInstancedBoulders,
  createPineForest,
  createTerrainMesh,
  createWeatherStationGroup,
} from '../scene/models';
import { computeRealSolarAngles, createAtmosphericSkyDome } from '../scene/skyDome';
import { createProceduralTextures } from '../scene/textures';

export type CameraPreset = 'station' | 'horizon' | 'sky';

export interface WeatherSceneProps {
  weatherCode: number;
  isDay: boolean;
  windSpeedKmh: number;
  windDirectionDeg: number;
  cloudCover: number;
  precipitationMm: number;
  visibilityKm: number;
  humidity: number;
  observationTimeIso?: string;
  sunriseIso?: string;
  sunsetIso?: string;
  hasSevereAlert: boolean;
  cameraPreset: CameraPreset;
  presetNonce: number;
}

const CAMERA_PRESETS: Record<
  CameraPreset,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  station: { pos: [5.4, 3.5, 8.2], target: [0, 2.3, -1.5] },
  horizon: { pos: [8.8, 4.4, 13.8], target: [0, 3.2, -16] },
  sky: { pos: [3.2, 2.0, 7.6], target: [0, 6.4, -14] },
};

// Pre-allocated scratch objects outside the render loop (zero GC)
const _zenithTarget = new THREE.Color();
const _horizonTarget = new THREE.Color();
const _sunGlowTarget = new THREE.Color();
const _cloudLightTarget = new THREE.Color();
const _cloudShadowTarget = new THREE.Color();
const _keyColorTarget = new THREE.Color();
const _hemiSkyTarget = new THREE.Color();
const _hemiGroundTarget = new THREE.Color();
const _beaconTarget = new THREE.Color();
const _concreteTarget = new THREE.Color();
const _scratchColor = new THREE.Color();
const _targetSunDir = new THREE.Vector3();
const _targetMoonDir = new THREE.Vector3();
const _windVec = new THREE.Vector3();
const _rainTiltQuat = new THREE.Quaternion();
const _rainVec = new THREE.Vector3();
const _upAxis = new THREE.Vector3(0, 1, 0);
const _camGoalPos = new THREE.Vector3();
const _camGoalTarget = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export function WeatherScene3D({
  weatherCode,
  isDay,
  windSpeedKmh,
  windDirectionDeg,
  cloudCover,
  precipitationMm,
  visibilityKm,
  humidity,
  observationTimeIso,
  sunriseIso,
  sunsetIso,
  hasSevereAlert,
  cameraPreset,
  presetNonce,
}: WeatherSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  const weatherStateRef = useRef({
    weatherCode,
    isDay,
    windSpeedKmh,
    windDirectionDeg,
    cloudCover,
    precipitationMm,
    visibilityKm,
    humidity,
    observationTimeIso,
    sunriseIso,
    sunsetIso,
    hasSevereAlert,
  });

  weatherStateRef.current = {
    weatherCode,
    isDay,
    windSpeedKmh,
    windDirectionDeg,
    cloudCover,
    precipitationMm,
    visibilityKm,
    humidity,
    observationTimeIso,
    sunriseIso,
    sunsetIso,
    hasSevereAlert,
  };

  const cameraGlideRef = useRef<{
    active: boolean;
    preset: CameraPreset;
  }>({
    active: false,
    preset: cameraPreset,
  });

  useEffect(() => {
    cameraGlideRef.current = {
      active: true,
      preset: cameraPreset,
    };
  }, [cameraPreset, presetNonce]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglUnavailable(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight
    );

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const initialFogHex = 0x9bc7eb;
    scene.background = new THREE.Color(initialFogHex);
    const fog = new THREE.FogExp2(initialFogHex, 0.008);
    scene.fog = fog;

    // Procedural Studio Environment Reflection via RoomEnvironment
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      46,
      (container.clientWidth || window.innerWidth) /
        (container.clientHeight || window.innerHeight),
      0.1,
      360
    );
    const startPreset = CAMERA_PRESETS[cameraPreset];
    camera.position.set(...startPreset.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...startPreset.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 5.5;
    controls.maxDistance = 28;
    controls.maxPolarAngle = Math.PI * 0.485;
    controls.minPolarAngle = 0.2;
    controls.update();

    const handleControlStart = () => {
      cameraGlideRef.current.active = false;
    };
    controls.addEventListener('start', handleControlStart);

    // Physically-inspired Atmospheric Sky & Cloud Shader Dome
    const skyDome = createAtmosphericSkyDome();
    scene.add(skyDome.mesh);

    // 3-Point + Hemisphere Atmospheric Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0x9ac6f5, 0x3b4d3b, 0.72);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1d6, 2.2);
    keyLight.position.set(14, 18, -16);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 75;
    const d = 20;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x8bb8e8, 0.52);
    rimLight.position.set(-14, 10, 14);
    scene.add(rimLight);

    // Lightning transient point light
    const lightningLight = new THREE.PointLight(0xdce8ff, 0, 110, 1.4);
    lightningLight.position.set(-6, 20, -18);
    scene.add(lightningLight);

    // Procedural Textures & World Geometry
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const textures = createProceduralTextures(maxAniso);

    const terrain = createTerrainMesh(textures);
    scene.add(terrain);

    const station = createWeatherStationGroup(textures, isSoftwareGl);
    scene.add(station.root);

    const { forestGroup, trees } = createPineForest();
    scene.add(forestGroup);

    const boulders = createInstancedBoulders();
    scene.add(boulders);

    // Instanced Rain Streaks, Pad Splash Ripples & Snowflakes
    const rainCount = 520;
    const rainGeo = new THREE.CylinderGeometry(0.011, 0.016, 1.05, 5);
    const rainMat = new THREE.MeshBasicMaterial({
      color: 0xdbeafe,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
    });
    const rainMesh = new THREE.InstancedMesh(rainGeo, rainMat, rainCount);
    rainMesh.frustumCulled = false;
    rainMesh.visible = false;
    const rainDrops = Array.from({ length: rainCount }, (_, i) => {
      const spread = i < 240 ? 15 : 34;
      return {
        x: ((i * 19.3) % spread) - spread / 2,
        y: ((i * 7.7) % 18) + 0.5,
        z: ((i * 23.1) % spread) - spread / 2,
        speed: 17 + (i % 7) * 1.6,
        spread,
      };
    });
    scene.add(rainMesh);

    const splashCount = 30;
    const splashGeo = new THREE.RingGeometry(0.07, 0.125, 16);
    splashGeo.rotateX(-Math.PI / 2);
    const splashMat = new THREE.MeshBasicMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const splashMesh = new THREE.InstancedMesh(splashGeo, splashMat, splashCount);
    splashMesh.frustumCulled = false;
    splashMesh.visible = false;
    const splashes = Array.from({ length: splashCount }, (_, i) => {
      const angle = (i / splashCount) * Math.PI * 2 + (i % 3) * 0.4;
      const radius = i < 12 ? 0.35 + (i % 5) * 0.24 : 2.1 + (i % 6) * 0.85;
      return {
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        y: i < 12 ? 0.24 : 0.04,
        phase: (i * 0.37) % 1,
      };
    });
    scene.add(splashMesh);

    const snowCount = 260;
    const snowGeo = new THREE.IcosahedronGeometry(0.055, 0);
    const snowMat = new THREE.MeshBasicMaterial({
      color: 0xf8fafc,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const snowMesh = new THREE.InstancedMesh(snowGeo, snowMat, snowCount);
    snowMesh.frustumCulled = false;
    snowMesh.visible = false;
    const snowFlakes = Array.from({ length: snowCount }, (_, i) => ({
      x: ((i * 17.7) % 34) - 17,
      y: ((i * 9.1) % 17) + 0.5,
      z: ((i * 21.3) % 34) - 17,
      speed: 2.0 + (i % 6) * 0.35,
      phase: i * 0.6,
    }));
    scene.add(snowMesh);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Resize Observer
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);

    // Loop State
    let frameId = 0;
    let disposed = false;
    let prevTime = performance.now();
    let elapsed = 0;
    let lightningTimer = 2.5;
    let lightningIntensity = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || !gl.fenceSync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min((now - prevTime) / 1000, 0.1);
      prevTime = now;
      elapsed += dt;

      const ws = weatherStateRef.current;
      const code = ws.weatherCode;
      const isStorm = code >= 95;
      const isSnow = (code >= 71 && code <= 77) || code === 85 || code === 86;
      const isRain =
        !isSnow &&
        ((code >= 51 && code <= 67) ||
          (code >= 80 && code <= 82) ||
          isStorm ||
          ws.precipitationMm >= 0.35);
      const isFoggy = code === 45 || code === 48;

      const cloudFrac = THREE.MathUtils.clamp(
        isStorm || isRain ? Math.max(ws.cloudCover / 100, 0.82) : ws.cloudCover / 100,
        0,
        1
      );
      const rainFrac = isRain
        ? THREE.MathUtils.clamp(0.45 + ws.precipitationMm * 0.14, 0.45, 1.0)
        : 0;
      const stormFrac = isStorm ? 1 : 0;

      // Visibility + Humidity -> real atmospheric horizon haze
      const visHaze = 1 - THREE.MathUtils.smoothstep(ws.visibilityKm, 1.5, 22.0);
      const humidHaze = THREE.MathUtils.smoothstep(ws.humidity, 60, 98) * 0.32;
      const hazeFrac = THREE.MathUtils.clamp(
        isFoggy ? 0.92 : Math.max(visHaze, humidHaze) + rainFrac * 0.25,
        0.06,
        0.96
      );

      // 1. Real Local Solar & Lunar Geometry
      const solar = computeRealSolarAngles(
        ws.isDay,
        ws.observationTimeIso,
        ws.sunriseIso,
        ws.sunsetIso,
        _targetSunDir,
        _targetMoonDir
      );

      const envLerp = 1 - Math.exp(-3.0 * dt);
      skyDome.uniforms.uTime.value = elapsed;
      skyDome.uniforms.uSunDir.value.lerp(_targetSunDir, envLerp).normalize();
      skyDome.uniforms.uMoonDir.value.lerp(_targetMoonDir, envLerp).normalize();
      skyDome.uniforms.uCloudCover.value = THREE.MathUtils.lerp(
        skyDome.uniforms.uCloudCover.value,
        cloudFrac,
        envLerp
      );
      skyDome.uniforms.uHazeFactor.value = THREE.MathUtils.lerp(
        skyDome.uniforms.uHazeFactor.value,
        hazeFrac,
        envLerp
      );
      skyDome.uniforms.uNightFactor.value = THREE.MathUtils.lerp(
        skyDome.uniforms.uNightFactor.value,
        solar.nightFactor,
        envLerp
      );
      skyDome.uniforms.uTwilightFactor.value = THREE.MathUtils.lerp(
        skyDome.uniforms.uTwilightFactor.value,
        solar.twilightFactor,
        envLerp
      );
      skyDome.uniforms.uRainFactor.value = THREE.MathUtils.lerp(
        skyDome.uniforms.uRainFactor.value,
        rainFrac,
        envLerp
      );
      skyDome.uniforms.uStormFactor.value = THREE.MathUtils.lerp(
        skyDome.uniforms.uStormFactor.value,
        stormFrac,
        envLerp
      );

      // 2. Real Sky Palette: Day -> Golden-Hour Twilight -> Night, modulated by Overcast/Rain/Storm
      // Clear daylight baseline
      _zenithTarget.setHex(0x1f5faa);
      _horizonTarget.setHex(0x98c4e8);
      _sunGlowTarget.setHex(0xffe5b8);
      _cloudLightTarget.setHex(0xfbfdff);
      _cloudShadowTarget.setHex(0x8da0b8);
      _keyColorTarget.setHex(0xfff0d4);
      _hemiSkyTarget.setHex(0x9bc7f2);
      _hemiGroundTarget.setHex(0x3b4d3b);

      // Blend Golden-Hour / Sunset / Sunrise warmth
      if (solar.twilightFactor > 0.02) {
        const tw = solar.twilightFactor * (1 - solar.nightFactor * 0.55);
        _zenithTarget.lerp(_scratchColor.setHex(0x283a6b), tw * 0.75);
        _horizonTarget.lerp(_scratchColor.setHex(0xe08d63), tw * 0.72);
        _sunGlowTarget.lerp(_scratchColor.setHex(0xff944d), tw * 0.85);
        _cloudLightTarget.lerp(_scratchColor.setHex(0xffc99e), tw * 0.78);
        _cloudShadowTarget.lerp(_scratchColor.setHex(0x635875), tw * 0.7);
        _keyColorTarget.lerp(_scratchColor.setHex(0xffa463), tw * 0.75);
        _hemiSkyTarget.lerp(_scratchColor.setHex(0xd98a6c), tw * 0.6);
      }

      // Blend Nighttime sky
      if (solar.nightFactor > 0.02) {
        const nf = solar.nightFactor;
        _zenithTarget.lerp(_scratchColor.setHex(0x060d1c), nf);
        _horizonTarget.lerp(_scratchColor.setHex(0x13223b), nf);
        _cloudLightTarget.lerp(_scratchColor.setHex(0x2d3c57), nf);
        _cloudShadowTarget.lerp(_scratchColor.setHex(0x131c2e), nf);
        _keyColorTarget.lerp(_scratchColor.setHex(0x9bb8e8), nf);
        _hemiSkyTarget.lerp(_scratchColor.setHex(0x2b3e5e), nf);
        _hemiGroundTarget.lerp(_scratchColor.setHex(0x121a1a), nf);
      }

      // Blend Overcast / Rain / Fog / Storm mood
      const overcastDesat = THREE.MathUtils.clamp(cloudFrac * 0.55 + rainFrac * 0.45, 0, 0.92);
      if (overcastDesat > 0.05) {
        const greyZenith = solar.nightFactor > 0.5 ? 0x101826 : isStorm ? 0x263140 : 0x5c7088;
        const greyHorizon = solar.nightFactor > 0.5 ? 0x182334 : isStorm ? 0x3b4859 : 0x8697aa;
        const greyCloudHi = solar.nightFactor > 0.5 ? 0x2a3548 : isStorm ? 0x556274 : 0xc6d0dc;
        const greyCloudLo = solar.nightFactor > 0.5 ? 0x121926 : isStorm ? 0x2a3442 : 0x6c7a8c;
        _zenithTarget.lerp(_scratchColor.setHex(greyZenith), overcastDesat * 0.85);
        _horizonTarget.lerp(_scratchColor.setHex(greyHorizon), overcastDesat * 0.85);
        _cloudLightTarget.lerp(_scratchColor.setHex(greyCloudHi), overcastDesat * 0.82);
        _cloudShadowTarget.lerp(_scratchColor.setHex(greyCloudLo), overcastDesat * 0.85);
        _hemiSkyTarget.lerp(_scratchColor.setHex(greyHorizon), overcastDesat * 0.65);
      }

      skyDome.uniforms.uZenithColor.value.lerp(_zenithTarget, envLerp);
      skyDome.uniforms.uHorizonColor.value.lerp(_horizonTarget, envLerp);
      skyDome.uniforms.uSunGlowColor.value.lerp(_sunGlowTarget, envLerp);
      skyDome.uniforms.uCloudLightColor.value.lerp(_cloudLightTarget, envLerp);
      skyDome.uniforms.uCloudShadowColor.value.lerp(_cloudShadowTarget, envLerp);

      // Sync FogExp2 + scene.background cleanly with the shader horizon color
      fog.color.copy(skyDome.uniforms.uHorizonColor.value);
      (scene.background as THREE.Color).copy(skyDome.uniforms.uHorizonColor.value);

      const targetFogDensity = isFoggy
        ? 0.028
        : isStorm
          ? 0.015
          : 0.0042 + hazeFrac * 0.014;
      fog.density = THREE.MathUtils.lerp(fog.density, targetFogDensity, envLerp);

      // Sync directional key light position & intensity to real sun/moon angle
      const activeLightDir =
        solar.nightFactor > 0.6 ? skyDome.uniforms.uMoonDir.value : skyDome.uniforms.uSunDir.value;
      keyLight.position.set(
        activeLightDir.x * 32,
        Math.max(activeLightDir.y * 32, 4.5),
        activeLightDir.z * 32
      );

      const clearDayBoost = (1 - cloudFrac * 0.45) * (1 - rainFrac * 0.35) * (1 - stormFrac * 0.35);
      const targetKeyIntensity =
        solar.nightFactor > 0.6
          ? 0.58
          : THREE.MathUtils.lerp(2.45, 1.35, solar.twilightFactor) * clearDayBoost;
      keyLight.intensity = THREE.MathUtils.lerp(keyLight.intensity, targetKeyIntensity, envLerp);
      keyLight.color.lerp(_keyColorTarget, envLerp);

      const targetHemiIntensity = solar.nightFactor > 0.6 ? 0.38 : isStorm ? 0.48 : 0.78;
      hemiLight.intensity = THREE.MathUtils.lerp(hemiLight.intensity, targetHemiIntensity, envLerp);
      hemiLight.color.lerp(_hemiSkyTarget, envLerp);
      hemiLight.groundColor.lerp(_hemiGroundTarget, envLerp);

      // Keep sky dome centered on camera so horizon never shifts on orbit
      skyDome.mesh.position.copy(camera.position);

      // Wet concrete pad sheen when raining vs dry matte concrete
      station.concreteMaterial.roughness = THREE.MathUtils.lerp(
        station.concreteMaterial.roughness,
        isRain ? 0.24 : 0.92,
        envLerp
      );
      _concreteTarget.setHex(isRain ? 0x76828e : 0xb7c0c9);
      station.concreteMaterial.color.lerp(_concreteTarget, envLerp);

      // 3. Weather Station Kinematics + Wind Vector
      const windNorm = THREE.MathUtils.clamp(ws.windSpeedKmh / 45, 0.06, 2.8);
      station.anemometerRotor.rotation.y += dt * (1.2 + windNorm * 6.4);

      const windRad = THREE.MathUtils.degToRad(ws.windDirectionDeg);
      // Horizontal wind travel vector in world XZ
      const windDirX = Math.sin(windRad);
      const windDirZ = Math.cos(windRad);

      // Shortest-angle damped rotation for wind vane
      const diff = Math.atan2(
        Math.sin(windRad - station.windVanePivot.rotation.y),
        Math.cos(windRad - station.windVanePivot.rotation.y)
      );
      station.windVanePivot.rotation.y += diff * (1 - Math.exp(-4.5 * dt));

      _beaconTarget.setHex(
        ws.hasSevereAlert || isStorm ? 0xef4444 : isRain ? 0xf59e0b : 0x10b981
      );
      station.beaconMaterial.color.lerp(_beaconTarget, envLerp);
      station.beaconMaterial.emissive.lerp(_beaconTarget, envLerp);

      // Drift shader clouds along the real wind vector
      const cloudSpeed = (0.014 + windNorm * 0.032) * dt;
      skyDome.uniforms.uCloudOffset.value.x += windDirX * cloudSpeed;
      skyDome.uniforms.uCloudOffset.value.y += windDirZ * cloudSpeed;

      // 4. Tree Wind Sway aligned with wind direction
      const swayAmp = 0.012 + windNorm * 0.028;
      const swayFreq = 1.3 + windNorm * 1.1;
      for (let i = 0; i < trees.length; i++) {
        const t = trees[i];
        const wave = Math.sin(elapsed * swayFreq + t.phase);
        t.group.rotation.z =
          t.baseTiltZ - windDirX * windNorm * 0.022 + wave * swayAmp;
        t.group.rotation.x =
          t.baseTiltX + windDirZ * windNorm * 0.022 + Math.cos(elapsed * swayFreq * 0.8 + t.phase) * swayAmp * 0.65;
      }

      // 5. Wind-Aligned Rain Streaks, Pad Splash Ripples & Snowflakes
      rainMesh.visible = isRain;
      splashMesh.visible = isRain;
      if (isRain) {
        const activeRainCount = Math.min(
          rainCount,
          Math.max(180, Math.round(200 + rainFrac * 320))
        );
        rainMesh.count = activeRainCount;
        rainMat.opacity = 0.4 + rainFrac * 0.32;

        const slantMag = THREE.MathUtils.clamp(windNorm * 0.22, 0.04, 0.42);
        _windVec.set(windDirX * slantMag, -1, windDirZ * slantMag).normalize();
        _rainVec.copy(_windVec).negate();
        _rainTiltQuat.setFromUnitVectors(_upAxis, _rainVec);
        _scale.set(1, 0.8 + rainFrac * 0.55, 1);

        for (let i = 0; i < activeRainCount; i++) {
          const drop = rainDrops[i];
          drop.y -= drop.speed * dt;
          drop.x += windDirX * drop.speed * slantMag * dt;
          drop.z += windDirZ * drop.speed * slantMag * dt;
          if (drop.y < 0) {
            drop.y = 17 + (i % 5);
            drop.x = ((i * 19.3) % drop.spread) - drop.spread / 2;
            drop.z = ((i * 23.1) % drop.spread) - drop.spread / 2;
          }
          _pos.set(drop.x, drop.y, drop.z);
          _mat4.compose(_pos, _rainTiltQuat, _scale);
          rainMesh.setMatrixAt(i, _mat4);
        }
        rainMesh.instanceMatrix.needsUpdate = true;

        _quat.identity();
        for (let i = 0; i < splashCount; i++) {
          const sp = splashes[i];
          sp.phase = (sp.phase + dt * (1.8 + rainFrac * 1.1)) % 1;
          const s = 0.4 + sp.phase * 2.4;
          _scale.set(s, 1, s);
          _pos.set(sp.x, sp.y, sp.z);
          _mat4.compose(_pos, _quat, _scale);
          splashMesh.setMatrixAt(i, _mat4);
        }
        splashMesh.instanceMatrix.needsUpdate = true;
      }

      snowMesh.visible = isSnow;
      if (isSnow) {
        _quat.identity();
        _scale.set(1, 1, 1);
        for (let i = 0; i < snowCount; i++) {
          const flake = snowFlakes[i];
          flake.y -= flake.speed * dt;
          flake.x +=
            (Math.sin(elapsed * 1.4 + flake.phase) * 0.5 + windDirX * windNorm * 0.9) * dt;
          flake.z +=
            (Math.cos(elapsed * 1.2 + flake.phase) * 0.5 + windDirZ * windNorm * 0.9) * dt;
          if (flake.y < 0) {
            flake.y = 17 + (i % 4);
            flake.x = ((i * 17.7) % 34) - 17;
            flake.z = ((i * 21.3) % 34) - 17;
          }
          _pos.set(flake.x, flake.y, flake.z);
          _mat4.compose(_pos, _quat, _scale);
          snowMesh.setMatrixAt(i, _mat4);
        }
        snowMesh.instanceMatrix.needsUpdate = true;
      }

      // 6. Thunderstorm Lightning Flash (illuminates both ground & cloud shader)
      if (isStorm) {
        lightningTimer -= dt;
        if (lightningTimer <= 0) {
          lightningIntensity = 22;
          lightningTimer = 2.2 + Math.random() * 4.2;
        }
        lightningIntensity = THREE.MathUtils.damp(lightningIntensity, 0, 11, dt);
        lightningLight.intensity = lightningIntensity;
        skyDome.uniforms.uLightningFlash.value = THREE.MathUtils.clamp(
          lightningIntensity / 16,
          0,
          1
        );
      } else {
        lightningLight.intensity = 0;
        skyDome.uniforms.uLightningFlash.value = 0;
      }

      // 7. Smooth Damped Camera Preset Transitions
      if (cameraGlideRef.current.active) {
        const preset = CAMERA_PRESETS[cameraGlideRef.current.preset];
        _camGoalPos.set(...preset.pos);
        _camGoalTarget.set(...preset.target);
        const camAlpha = 1 - Math.exp(-5.0 * dt);
        camera.position.lerp(_camGoalPos, camAlpha);
        controls.target.lerp(_camGoalTarget, camAlpha);
        if (
          camera.position.distanceTo(_camGoalPos) < 0.04 &&
          controls.target.distanceTo(_camGoalTarget) < 0.04
        ) {
          cameraGlideRef.current.active = false;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    frameId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      controls.removeEventListener('start', handleControlStart);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      controls.dispose();

      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry?.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else if (mesh.material) {
            mesh.material.dispose();
          }
        }
      });

      textures.dispose();
      envTarget.dispose();
      renderer.dispose();
    };
  }, []);

  if (webglUnavailable) {
    return (
      <div
        aria-hidden="true"
        className="fixed inset-0 z-0 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900"
      />
    );
  }

  return (
    <div
      ref={mountRef}
      aria-label="Interactive 3D weather observatory scene"
      className="fixed inset-0 z-0 w-full h-full cursor-grab active:cursor-grabbing"
    />
  );
}
