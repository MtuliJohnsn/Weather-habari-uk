export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface PlaceSearchResult {
  label: string;
  subtitle: string;
  lat: number;
  lng: number;
}

export type CommuteVehicleMode = 'DRIVING' | 'TWO_WHEELER';

export interface RadarFrame {
  time: number;
  path: string;
  label: string;
}

export interface RainViewerMetadata {
  host: string;
  frames: RadarFrame[];
  latestPastIndex: number;
}

export interface RouteWaypointWeather {
  index: number;
  lat: number;
  lng: number;
  distanceFromStartKm: number;
  etaIso: string;
  etaLabel: string;
  roadBearingDeg: number;
  temperatureC: number;
  weatherCode: number;
  conditionLabel: string;
  precipitationMm: number;
  precipitationProbability: number;
  windSpeedKmh: number;
  windGustsKmh: number;
  windDirectionDeg: number;
  crosswindKmh: number;
  crosswindGustKmh: number;
  crosswindSide: 'Left' | 'Right';
  visibilityKm: number;
  iceRisk: 'None' | 'Frost Watch' | 'High Ice Risk';
  segmentRating: 'Clear' | 'Caution' | 'Hazardous';
  hazardNote: string;
}

export interface CommuteWeatherAnalysis {
  vehicleMode: CommuteVehicleMode;
  distanceKm: number;
  durationMinutes: number;
  departureIso: string;
  arrivalIso: string;
  overallRating: 'Clear' | 'Caution' | 'Hazardous';
  summaryText: string;
  maxCrosswindKmh: number;
  maxRainMm: number;
  hasIceRisk: boolean;
  waypoints: RouteWaypointWeather[];
}

export interface FreeRouteGeometry {
  pathPoints: LatLngPoint[];
  distanceMeters: number;
  durationMillis: number;
}

export async function searchFreePlaces(
  query: string,
  biasLat: number,
  biasLng: number
): Promise<PlaceSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  // Primary: $0 Photon (Komoot / OpenStreetMap) geocoder with location bias
  try {
    const url = new URL('https://photon.komoot.io/api/');
    url.searchParams.set('q', trimmed);
    url.searchParams.set('lat', String(Number(biasLat.toFixed(4))));
    url.searchParams.set('lon', String(Number(biasLng.toFixed(4))));
    url.searchParams.set('limit', '6');

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 7000);
    const res = await fetch(url.toString(), { signal: controller.signal });
    window.clearTimeout(timer);

    if (res.ok) {
      const json = (await res.json()) as {
        features?: Array<{
          geometry?: { coordinates?: [number, number] };
          properties?: {
            name?: string;
            housenumber?: string;
            street?: string;
            city?: string;
            town?: string;
            state?: string;
            country?: string;
          };
        }>;
      };

      const mapped: PlaceSearchResult[] = [];
      for (const f of json.features || []) {
        const coords = f.geometry?.coordinates;
        const p = f.properties;
        if (!coords || coords.length < 2 || !p) continue;
        const lng = Number(coords[0]);
        const lat = Number(coords[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        const streetLine = [p.housenumber, p.street].filter(Boolean).join(' ').trim();
        const label = (p.name || streetLine || p.city || p.town || trimmed).trim();
        const subtitleParts = [
          p.name && streetLine && p.name !== streetLine ? streetLine : '',
          p.city || p.town || '',
          p.state || '',
          p.country || '',
        ].filter(Boolean);

        mapped.push({
          label,
          subtitle: subtitleParts.join(', '),
          lat,
          lng,
        });
      }

      if (mapped.length > 0) {
        return mapped;
      }
    }
  } catch {
    // Fall through to Open-Meteo Geocoding
  }

  // Fallback: $0 Open-Meteo Geocoding API
  const omUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
  omUrl.searchParams.set('name', trimmed);
  omUrl.searchParams.set('count', '6');
  omUrl.searchParams.set('language', 'en');
  omUrl.searchParams.set('format', 'json');

  const omRes = await fetch(omUrl.toString());
  if (!omRes.ok) {
    throw new Error('Unable to search places right now.');
  }

  const omData = (await omRes.json()) as {
    results?: Array<{
      name: string;
      latitude: number;
      longitude: number;
      admin1?: string;
      country?: string;
    }>;
  };

  return (omData.results || []).map((r) => ({
    label: r.name,
    subtitle: [r.admin1, r.country].filter(Boolean).join(', '),
    lat: Number(r.latitude),
    lng: Number(r.longitude),
  }));
}

export async function fetchFreeCommuteRoute(
  origin: LatLngPoint,
  destination: LatLngPoint
): Promise<FreeRouteGeometry | null> {
  const coords = `${origin.lng.toFixed(5)},${origin.lat.toFixed(5)};${destination.lng.toFixed(5)},${destination.lat.toFixed(5)}`;
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      if (res.status === 400 || res.status === 404) return null;
      throw new Error(`Road routing service returned HTTP ${res.status}.`);
    }
    const json = (await res.json()) as {
      code?: string;
      routes?: Array<{
        distance?: number;
        duration?: number;
        geometry?: {
          coordinates?: Array<[number, number]>;
        };
      }>;
    };

    const route = json.routes?.[0];
    const rawCoords = route?.geometry?.coordinates || [];
    if (json.code !== 'Ok' || !route || rawCoords.length < 2) {
      return null;
    }

    const pathPoints: LatLngPoint[] = rawCoords.map(([lng, lat]) => ({
      lat: Number(lat),
      lng: Number(lng),
    }));

    return {
      pathPoints,
      distanceMeters: Number(route.distance ?? 0),
      durationMillis: Math.max(60000, Number(route.duration ?? 600) * 1000),
    };
  } finally {
    window.clearTimeout(timer);
  }
}

export async function fetchRainViewerRadar(): Promise<RainViewerMetadata> {
  const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
  if (!res.ok) {
    throw new Error('Unable to load live precipitation radar metadata.');
  }
  const data = (await res.json()) as {
    host?: string;
    radar?: {
      past?: Array<{ time: number; path: string }>;
      nowcast?: Array<{ time: number; path: string }>;
    };
  };

  const host = data.host || 'https://tilecache.rainviewer.com';
  const pastFrames = (data.radar?.past || []).slice(-6);
  const nowcastFrames = (data.radar?.nowcast || []).slice(0, 2);
  const rawFrames = [...pastFrames, ...nowcastFrames];

  const fmt = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  const frames: RadarFrame[] = rawFrames.map((f, idx) => ({
    time: f.time,
    path: f.path,
    label:
      idx >= pastFrames.length
        ? `${fmt.format(new Date(f.time * 1000))} (Nowcast)`
        : fmt.format(new Date(f.time * 1000)),
  }));

  return {
    host,
    frames,
    latestPastIndex: Math.max(0, pastFrames.length - 1),
  };
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function haversineKm(a: LatLngPoint, b: LatLngPoint): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const c =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * R * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
}

function computeBearingDeg(a: LatLngPoint, b: LatLngPoint): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function describeShortWmo(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 2) return 'Partly Cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Dense Fog';
  if (code >= 51 && code <= 55) return 'Drizzle';
  if (code === 56 || code === 57 || code === 66 || code === 67) return 'Freezing Rain';
  if (code >= 61 && code <= 65) return code === 65 ? 'Heavy Rain' : 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Rain Showers';
  if (code === 85 || code === 86) return 'Snow Showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Mixed';
}

export async function analyzeRouteMicroWeather(params: {
  pathPoints: LatLngPoint[];
  totalDistanceMeters: number;
  totalDurationMillis: number;
  departureTimeMs: number;
  vehicleMode: CommuteVehicleMode;
}): Promise<CommuteWeatherAnalysis> {
  const { pathPoints, totalDistanceMeters, totalDurationMillis, departureTimeMs, vehicleMode } = params;

  if (pathPoints.length < 2) {
    throw new Error('Route geometry is too short for micro-weather sampling.');
  }

  // Compute cumulative distance along decoded route path
  const cumDistancesKm: number[] = [0];
  for (let i = 1; i < pathPoints.length; i++) {
    cumDistancesKm.push(cumDistancesKm[i - 1] + haversineKm(pathPoints[i - 1], pathPoints[i]));
  }
  const geometricTotalKm = cumDistancesKm[cumDistancesKm.length - 1] || 0.1;

  // Sample 6 evenly spaced route points (Start, 4 segments, Destination)
  const sampleCount = Math.min(6, Math.max(2, pathPoints.length));
  const sampled: Array<{
    lat: number;
    lng: number;
    bearing: number;
    distKm: number;
    etaMs: number;
  }> = [];

  for (let s = 0; s < sampleCount; s++) {
    const fraction = s / (sampleCount - 1);
    const targetKm = fraction * geometricTotalKm;

    let ptIdx = cumDistancesKm.findIndex((d) => d >= targetKm);
    if (ptIdx < 0) ptIdx = pathPoints.length - 1;

    const pt = pathPoints[ptIdx];
    const nextPt = pathPoints[Math.min(pathPoints.length - 1, ptIdx + 1)];
    const prevPt = pathPoints[Math.max(0, ptIdx - 1)];
    const bearing =
      ptIdx < pathPoints.length - 1
        ? computeBearingDeg(pt, nextPt)
        : computeBearingDeg(prevPt, pt);

    sampled.push({
      lat: Number(pt.lat.toFixed(4)),
      lng: Number(pt.lng.toFixed(4)),
      bearing,
      distKm: (totalDistanceMeters / 1000) * fraction,
      etaMs: departureTimeMs + totalDurationMillis * fraction,
    });
  }

  // Batch fetch Open-Meteo hourly forecast for all sampled coordinates in a single $0 request
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', sampled.map((s) => s.lat).join(','));
  url.searchParams.set('longitude', sampled.map((s) => s.lng).join(','));
  url.searchParams.set(
    'hourly',
    [
      'temperature_2m',
      'precipitation',
      'precipitation_probability',
      'weather_code',
      'wind_speed_10m',
      'wind_gusts_10m',
      'wind_direction_10m',
      'visibility',
    ].join(',')
  );
  url.searchParams.set('timezone', 'UTC');
  url.searchParams.set('forecast_days', '2');

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error('Unable to sample route weather from meteorological feed.');
  }

  const rawJson = await res.json();
  const resultsArray: Array<{
    hourly?: {
      time?: string[];
      temperature_2m?: number[];
      precipitation?: number[];
      precipitation_probability?: number[];
      weather_code?: number[];
      wind_speed_10m?: number[];
      wind_gusts_10m?: number[];
      wind_direction_10m?: number[];
      visibility?: number[];
    };
  }> = Array.isArray(rawJson) ? rawJson : [rawJson];

  const etaFmt = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  const isMoto = vehicleMode === 'TWO_WHEELER';

  const waypoints: RouteWaypointWeather[] = sampled.map((sp, idx) => {
    const locData = resultsArray[idx] || resultsArray[0] || {};
    const h = locData.hourly || {};
    const times = h.time || [];

    // Find closest UTC hour to ETA
    let hourIdx = 0;
    let smallestDiff = Infinity;
    for (let t = 0; t < times.length; t++) {
      const ms = Date.parse(`${times[t]}:00Z`);
      const diff = Math.abs(ms - sp.etaMs);
      if (diff < smallestDiff) {
        smallestDiff = diff;
        hourIdx = t;
      }
    }

    const tempC = Number(h.temperature_2m?.[hourIdx] ?? 15);
    const precipMm = Number(h.precipitation?.[hourIdx] ?? 0);
    const precipProb = Number(h.precipitation_probability?.[hourIdx] ?? 0);
    const wCode = Number(h.weather_code?.[hourIdx] ?? 0);
    const windKmh = Number(h.wind_speed_10m?.[hourIdx] ?? 0);
    const gustKmh = Number(h.wind_gusts_10m?.[hourIdx] ?? windKmh);
    const windDirDeg = Number(h.wind_direction_10m?.[hourIdx] ?? 0);
    const visKm = Number((h.visibility?.[hourIdx] ?? 16000) / 1000);

    // Relative wind angle perpendicular to heading
    const relRad = toRad(windDirDeg - sp.bearing);
    const crosswindKmh = Math.abs(windKmh * Math.sin(relRad));
    const crosswindGustKmh = Math.abs(gustKmh * Math.sin(relRad));
    const crosswindSide: 'Left' | 'Right' = Math.sin(relRad) >= 0 ? 'Right' : 'Left';

    const isFreezingCode = [56, 57, 66, 67, 71, 73, 75, 77, 85, 86].includes(wCode);
    const iceRisk: RouteWaypointWeather['iceRisk'] =
      isFreezingCode || (tempC <= 1.2 && (precipMm > 0 || precipProb >= 35))
        ? 'High Ice Risk'
        : tempC <= 2.8
          ? 'Frost Watch'
          : 'None';

    let segmentRating: RouteWaypointWeather['segmentRating'] = 'Clear';
    const notes: string[] = [];

    if (iceRisk === 'High Ice Risk') {
      segmentRating = 'Hazardous';
      notes.push('Freezing pavement / ice risk');
    } else if (iceRisk === 'Frost Watch') {
      segmentRating = isMoto ? 'Hazardous' : 'Caution';
      notes.push('Near-freezing bridges');
    }

    if (wCode >= 95 || precipMm >= (isMoto ? 2.5 : 5)) {
      segmentRating = 'Hazardous';
      notes.push(wCode >= 95 ? 'Storm cells on segment' : 'Heavy rain spray & hydroplaning');
    } else if (precipMm >= 0.3 || precipProb >= 45) {
      if (segmentRating === 'Clear') segmentRating = 'Caution';
      notes.push('Wet pavement expected');
    }

    if (crosswindGustKmh >= (isMoto ? 34 : 52) || crosswindKmh >= (isMoto ? 24 : 38)) {
      segmentRating = 'Hazardous';
      notes.push(`Strong ${crosswindSide.toLowerCase()} crosswind`);
    } else if (crosswindGustKmh >= (isMoto ? 22 : 35)) {
      if (segmentRating === 'Clear') segmentRating = 'Caution';
      notes.push(`Moderate ${crosswindSide.toLowerCase()} crosswind`);
    }

    if (visKm < 2.0) {
      segmentRating = 'Hazardous';
      notes.push('Low fog visibility');
    } else if (visKm < 5.0) {
      if (segmentRating === 'Clear') segmentRating = 'Caution';
      notes.push('Reduced haze/mist visibility');
    }

    return {
      index: idx,
      lat: sp.lat,
      lng: sp.lng,
      distanceFromStartKm: sp.distKm,
      etaIso: new Date(sp.etaMs).toISOString(),
      etaLabel: etaFmt.format(new Date(sp.etaMs)),
      roadBearingDeg: Math.round(sp.bearing),
      temperatureC: tempC,
      weatherCode: wCode,
      conditionLabel: describeShortWmo(wCode),
      precipitationMm: precipMm,
      precipitationProbability: precipProb,
      windSpeedKmh: windKmh,
      windGustsKmh: gustKmh,
      windDirectionDeg: windDirDeg,
      crosswindKmh,
      crosswindGustKmh,
      crosswindSide,
      visibilityKm: visKm,
      iceRisk,
      segmentRating,
      hazardNote: notes.length > 0 ? notes.join(' · ') : 'Dry grip & clear sightlines',
    };
  });

  const maxCrosswindKmh = Math.max(...waypoints.map((w) => w.crosswindGustKmh), 0);
  const maxRainMm = Math.max(...waypoints.map((w) => w.precipitationMm), 0);
  const hasIceRisk = waypoints.some((w) => w.iceRisk === 'High Ice Risk');
  const overallRating: CommuteWeatherAnalysis['overallRating'] = waypoints.some(
    (w) => w.segmentRating === 'Hazardous'
  )
    ? 'Hazardous'
    : waypoints.some((w) => w.segmentRating === 'Caution')
      ? 'Caution'
      : 'Clear';

  const summaryText =
    overallRating === 'Hazardous'
      ? isMoto
        ? 'High rider exposure along route segments (crosswind, wet grip, or freeze risk).'
        : 'Hazardous micro-weather detected on portions of your drive window.'
      : overallRating === 'Caution'
        ? isMoto
          ? 'Watch wet pavement spots or moderate crosswinds on exposed segments.'
          : 'Localized rain or gusty crosswind spots during your commute window.'
        : 'Favorable road weather across all sampled segments for your departure time.';

  return {
    vehicleMode,
    distanceKm: totalDistanceMeters / 1000,
    durationMinutes: Math.max(1, Math.round(totalDurationMillis / 60000)),
    departureIso: new Date(departureTimeMs).toISOString(),
    arrivalIso: new Date(departureTimeMs + totalDurationMillis).toISOString(),
    overallRating,
    summaryText,
    maxCrosswindKmh,
    maxRainMm,
    hasIceRisk,
    waypoints,
  };
}
