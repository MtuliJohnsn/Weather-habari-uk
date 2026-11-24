import * as THREE from 'three';

export interface ProceduralTextureSet {
  terrainAlbedo: THREE.CanvasTexture;
  terrainRoughness: THREE.CanvasTexture;
  solarAlbedo: THREE.CanvasTexture;
  brushedMetalRoughness: THREE.CanvasTexture;
  concreteAlbedo: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  // 1. Terrain Meadow & Mineral Albedo (sRGB)
  const [tCanvas, tCtx] = makeCanvas(512, 512);
  tCtx.fillStyle = '#4c6e49';
  tCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 4800; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 1 + Math.random() * 3.5;
    const shade = Math.random();
    if (shade < 0.35) tCtx.fillStyle = 'rgba(62, 95, 58, 0.35)';
    else if (shade < 0.7) tCtx.fillStyle = 'rgba(92, 128, 78, 0.28)';
    else tCtx.fillStyle = 'rgba(116, 134, 92, 0.22)';
    tCtx.beginPath();
    tCtx.arc(x, y, r, 0, Math.PI * 2);
    tCtx.fill();
  }
  const terrainAlbedo = new THREE.CanvasTexture(tCanvas);
  terrainAlbedo.colorSpace = THREE.SRGBColorSpace;
  terrainAlbedo.wrapS = THREE.RepeatWrapping;
  terrainAlbedo.wrapT = THREE.RepeatWrapping;
  terrainAlbedo.repeat.set(14, 14);
  terrainAlbedo.anisotropy = maxAnisotropy;

  // 2. Terrain Roughness / Bump (Linear)
  const [trCanvas, trCtx] = makeCanvas(256, 256);
  trCtx.fillStyle = '#d4d4d4';
  trCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2400; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const v = 175 + Math.floor(Math.random() * 65);
    trCtx.fillStyle = `rgb(${v},${v},${v})`;
    trCtx.fillRect(x, y, 2, 2);
  }
  const terrainRoughness = new THREE.CanvasTexture(trCanvas);
  terrainRoughness.wrapS = THREE.RepeatWrapping;
  terrainRoughness.wrapT = THREE.RepeatWrapping;
  terrainRoughness.repeat.set(14, 14);
  terrainRoughness.anisotropy = maxAnisotropy;

  // 3. Photovoltaic Solar Cell Grid (sRGB)
  const [sCanvas, sCtx] = makeCanvas(512, 512);
  sCtx.fillStyle = '#0f213f';
  sCtx.fillRect(0, 0, 512, 512);
  const cols = 6;
  const rows = 8;
  const cellW = 512 / cols;
  const cellH = 512 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const grad = sCtx.createLinearGradient(c * cellW, r * cellH, (c + 1) * cellW, (r + 1) * cellH);
      grad.addColorStop(0, '#132d56');
      grad.addColorStop(1, '#0c1c38');
      sCtx.fillStyle = grad;
      sCtx.fillRect(c * cellW + 3, r * cellH + 3, cellW - 6, cellH - 6);
      // Busbar micro-lines
      sCtx.strokeStyle = 'rgba(175, 205, 245, 0.28)';
      sCtx.lineWidth = 1.2;
      sCtx.beginPath();
      sCtx.moveTo(c * cellW + cellW * 0.33, r * cellH + 3);
      sCtx.lineTo(c * cellW + cellW * 0.33, (r + 1) * cellH - 3);
      sCtx.moveTo(c * cellW + cellW * 0.66, r * cellH + 3);
      sCtx.lineTo(c * cellW + cellW * 0.66, (r + 1) * cellH - 3);
      sCtx.stroke();
    }
  }
  const solarAlbedo = new THREE.CanvasTexture(sCanvas);
  solarAlbedo.colorSpace = THREE.SRGBColorSpace;
  solarAlbedo.anisotropy = maxAnisotropy;

  // 4. Brushed Metal Roughness (Linear)
  const [mCanvas, mCtx] = makeCanvas(256, 256);
  mCtx.fillStyle = '#525252';
  mCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 2) {
    const v = 58 + Math.floor(Math.random() * 42);
    mCtx.fillStyle = `rgb(${v},${v},${v})`;
    mCtx.fillRect(0, y, 256, 1);
  }
  const brushedMetalRoughness = new THREE.CanvasTexture(mCanvas);
  brushedMetalRoughness.wrapS = THREE.RepeatWrapping;
  brushedMetalRoughness.wrapT = THREE.RepeatWrapping;
  brushedMetalRoughness.anisotropy = maxAnisotropy;

  // 5. Concrete Foundation Albedo (sRGB)
  const [cCanvas, cCtx] = makeCanvas(256, 256);
  cCtx.fillStyle = '#9aa3ad';
  cCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const v = 135 + Math.floor(Math.random() * 40);
    cCtx.fillStyle = `rgba(${v}, ${v + 3}, ${v + 7}, 0.35)`;
    cCtx.fillRect(x, y, 2, 2);
  }
  const concreteAlbedo = new THREE.CanvasTexture(cCanvas);
  concreteAlbedo.colorSpace = THREE.SRGBColorSpace;
  concreteAlbedo.anisotropy = maxAnisotropy;

  // 6. Soft Radial Contact Shadow Texture
  const [csCanvas, csCtx] = makeCanvas(256, 256);
  const radGrad = csCtx.createRadialGradient(128, 128, 12, 128, 128, 124);
  radGrad.addColorStop(0, 'rgba(10, 15, 25, 0.72)');
  radGrad.addColorStop(0.5, 'rgba(10, 15, 25, 0.28)');
  radGrad.addColorStop(1, 'rgba(10, 15, 25, 0.0)');
  csCtx.fillStyle = radGrad;
  csCtx.fillRect(0, 0, 256, 256);
  const contactShadow = new THREE.CanvasTexture(csCanvas);
  contactShadow.colorSpace = THREE.SRGBColorSpace;

  return {
    terrainAlbedo,
    terrainRoughness,
    solarAlbedo,
    brushedMetalRoughness,
    concreteAlbedo,
    contactShadow,
    dispose: () => {
      terrainAlbedo.dispose();
      terrainRoughness.dispose();
      solarAlbedo.dispose();
      brushedMetalRoughness.dispose();
      concreteAlbedo.dispose();
      contactShadow.dispose();
    },
  };
}
