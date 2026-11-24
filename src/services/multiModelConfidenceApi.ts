import { describeWeatherCode, formatTempWithUnit } from './weatherApi';
import { TemperatureUnit } from '../types/weather';

export type ConfidenceWindow = '6h' | '12h' | '24h';

export interface SingleModelSnapshot {
  id: 'ecmwf_ifs025' | 'gfs_seamless' | 'icon_seamless';
  name: string;
  agency: string;
  tempMinC: number;
  tempMaxC: number;
  totalPrecipMm: number;
  maxPrecipProb: number;
  dominantCode: number;
  summary: string;
}

export interface ForecastConfidenceResult {
  windowHours: 6 | 12 | 24;
  score: number;
  tier: 'High' | 'Moderate' | 'Low';
  headline: string;
  explanation: string;
  tempSpreadC: number;
  rainSpreadMm: number;
  models: SingleModelSnapshot[];
  fetchedAtIso: string;
}

interface MultiModelRawHourly {
  time?: string[];
  [key: string]: Array<number | null> | string[] | undefined;
}

const MODEL_META: Array<{
  id: SingleModelSnapshot['id'];
  name: string;
  agency: string;
}> = [
  { id: 'ecmwf_ifs025', name: 'ECMWF IFS', agency: 'European Centre' },
  { id: 'gfs_seamless', name: 'NOAA GFS', agency: 'US National Weather' },
  { id: 'icon_seamless', name: 'DWD ICON', agency: 'German Weather Service' },
];

export interface MultiModelDataset {
  hourly: MultiModelRawHourly;
  startIndex: number;
}

export async function fetchMultiModelDataset(
  latitude: number,
  longitude: number
): Promise<MultiModelDataset> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', latitude.toString());
  url.searchParams.set('longitude', longitude.toString());
  url.searchParams.set(
    'hourly',
    'temperature_2m,precipitation_probability,precipitation,weather_code'
  );
  url.searchParams.set('models', 'ecmwf_ifs025,gfs_seamless,icon_seamless');
  url.searchParams.set('forecast_days', '2');
  url.searchParams.set('timezone', 'auto');

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error('Unable to fetch multi-model consensus feed.');
  }

  const data = (await res.json()) as {
    utc_offset_seconds?: number;
    hourly?: MultiModelRawHourly;
  };
  const hourly = data.hourly || {};
  const times = hourly.time || [];

  // Align startIndex to current local hour in city timezone
  const offsetSec = Number(data.utc_offset_seconds ?? 0);
  const localNow = new Date(Date.now() + offsetSec * 1000);
  const localHourPrefix = localNow.toISOString().slice(0, 13);
  let startIndex = times.findIndex((t) => t >= localHourPrefix);
  if (startIndex < 0) startIndex = 0;

  return { hourly, startIndex };
}

export function computeForecastConfidence(
  dataset: MultiModelDataset,
  windowChoice: ConfidenceWindow,
  unit: TemperatureUnit
): ForecastConfidenceResult {
  const windowHours: 6 | 12 | 24 =
    windowChoice === '6h' ? 6 : windowChoice === '12h' ? 12 : 24;

  const { hourly, startIndex } = dataset;
  const endIndex = startIndex + windowHours;

  const models: SingleModelSnapshot[] = MODEL_META.map((meta) => {
    const tempsRaw = (hourly[`temperature_2m_${meta.id}`] as Array<number | null> | undefined) || [];
    const probsRaw =
      (hourly[`precipitation_probability_${meta.id}`] as Array<number | null> | undefined) || [];
    const precipRaw = (hourly[`precipitation_${meta.id}`] as Array<number | null> | undefined) || [];
    const codesRaw = (hourly[`weather_code_${meta.id}`] as Array<number | null> | undefined) || [];

    const temps = tempsRaw.slice(startIndex, endIndex).filter((v): v is number => v !== null && Number.isFinite(v));
    const precips = precipRaw
      .slice(startIndex, endIndex)
      .filter((v): v is number => v !== null && Number.isFinite(v));
    const probs = probsRaw
      .slice(startIndex, endIndex)
      .filter((v): v is number => v !== null && Number.isFinite(v));
    const codes = codesRaw.slice(startIndex, endIndex).filter((v): v is number => v !== null && Number.isFinite(v));

    const tempMinC = temps.length > 0 ? Math.min(...temps) : 15;
    const tempMaxC = temps.length > 0 ? Math.max(...temps) : 15;
    const totalPrecipMm = precips.reduce((acc, v) => acc + v, 0);

    // Derive max precipitation probability from explicit probs or rain intensity fallback
    const inferredProbFromRain = precips.some((p) => p >= 1.5)
      ? 80
      : precips.some((p) => p >= 0.2)
        ? 55
        : codes.some((c) => c >= 51)
          ? 50
          : 10;
    const maxPrecipProb = probs.length > 0 ? Math.max(...probs) : inferredProbFromRain;

    // Pick most impactful WMO code in window
    const dominantCode = codes.length > 0 ? Math.max(...codes) : 0;

    let summary = describeWeatherCode(dominantCode);
    if (totalPrecipMm >= 2) {
      summary = `${summary} (${totalPrecipMm.toFixed(1)} mm)`;
    } else if (totalPrecipMm < 0.2 && dominantCode < 50) {
      summary = `${describeWeatherCode(dominantCode)} · Dry`;
    }

    return {
      id: meta.id,
      name: meta.name,
      agency: meta.agency,
      tempMinC,
      tempMaxC,
      totalPrecipMm,
      maxPrecipProb,
      dominantCode,
      summary,
    };
  });

  // Evaluate model spread across the 3 numerical models
  const maxTemps = models.map((m) => m.tempMaxC);
  const minTemps = models.map((m) => m.tempMinC);
  const rainTotals = models.map((m) => m.totalPrecipMm);
  const wetFlags = models.map((m) => m.totalPrecipMm >= 0.4 || m.dominantCode >= 51);

  const tempSpreadC =
    Math.max(...maxTemps) - Math.min(...maxTemps) + (Math.max(...minTemps) - Math.min(...minTemps)) * 0.5;
  const rainSpreadMm = Math.max(...rainTotals) - Math.min(...rainTotals);
  const allWetAgree = wetFlags.every((f) => f === wetFlags[0]);

  let penalty = 0;
  penalty += Math.min(35, tempSpreadC * 6.5);
  penalty += Math.min(35, rainSpreadMm * 4.5);
  if (!allWetAgree) {
    penalty += 28;
  }

  const score = Math.max(18, Math.min(98, Math.round(97 - penalty)));
  const tier: ForecastConfidenceResult['tier'] =
    score >= 76 ? 'High' : score >= 52 ? 'Moderate' : 'Low';

  const allDry = models.every((m) => m.totalPrecipMm < 0.3 && m.dominantCode < 51);
  const allWet = models.every((m) => m.totalPrecipMm >= 0.5 || m.dominantCode >= 51);

  let headline = '';
  let explanation = '';

  if (tier === 'High') {
    if (allDry) {
      headline = `High Confidence (${score}%): Clear & dry agreement`;
      explanation = `ECMWF, GFS, and ICON all align within ${tempSpreadC.toFixed(1)}°C with dry conditions over the next ${windowHours} hours.`;
    } else if (allWet) {
      headline = `High Confidence (${score}%): Rain timing strongly agreed`;
      explanation = `All 3 weather models forecast measurable precipitation (${formatTempWithUnit(
        Math.min(...minTemps),
        unit
      )}–${formatTempWithUnit(Math.max(...maxTemps), unit)} range).`;
    } else {
      headline = `High Confidence (${score}%): Steady consensus`;
      explanation = `Minimal spread across European, US, and German models over the next ${windowHours} hours.`;
    }
  } else if (tier === 'Moderate') {
    headline = `Moderate Confidence (${score}%): Minor timing or cloud spread`;
    explanation = !allWetAgree
      ? `One weather model hints at brief light showers while others stay mostly dry — bring a light layer.`
      : `Models vary by ${tempSpreadC.toFixed(1)}°C or ${rainSpreadMm.toFixed(1)} mm on intensity.`;
  } else {
    headline = `Low Confidence (${score}%): Models diverge — keep plans flexible`;
    explanation = !allWetAgree
      ? `Models disagree on whether rain reaches your area (${rainSpreadMm.toFixed(1)} mm spread). Watch live radar before heading out.`
      : `Notable ${rainSpreadMm.toFixed(1)} mm precipitation and temperature spread across ECMWF, GFS, and ICON.`;
  }

  return {
    windowHours,
    score,
    tier,
    headline,
    explanation,
    tempSpreadC,
    rainSpreadMm,
    models,
    fetchedAtIso: new Date().toISOString(),
  };
}
