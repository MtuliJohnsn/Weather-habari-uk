import {
  ActivityPrediction,
  ActivitySuitability,
  CurrentWeatherData,
  DailyForecastPoint,
  HourlyForecastPoint,
  TemperatureUnit,
} from '../types/weather';
import { formatTempWithUnit, formatWind } from '../services/weatherApi';

interface EvalInput {
  tempC: number;
  feelsLikeC: number;
  windKmh: number;
  gustsKmh: number;
  precipProb: number;
  precipMm: number;
  weatherCode: number;
  humidity: number;
  uvIndex: number;
  cloudCover: number;
  isDay: boolean;
}

function formatHourLabel(iso: string): string {
  const timePart = iso.split('T')[1] || '00:00';
  const [hourStr] = timePart.split(':');
  const hour = Number(hourStr);
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
}

function currentToEval(c: CurrentWeatherData): EvalInput {
  return {
    tempC: c.temperatureC,
    feelsLikeC: c.apparentTemperatureC,
    windKmh: c.windSpeedKmh,
    gustsKmh: c.windGustsKmh,
    precipProb: c.precipitationProbability,
    precipMm: c.precipitationMm,
    weatherCode: c.weatherCode,
    humidity: c.humidity,
    uvIndex: c.uvIndex,
    cloudCover: c.cloudCover,
    isDay: c.isDay,
  };
}

function hourlyToEval(h: HourlyForecastPoint): EvalInput {
  return {
    tempC: h.temperatureC,
    feelsLikeC: h.apparentTemperatureC,
    windKmh: h.windSpeedKmh,
    gustsKmh: h.windGustsKmh,
    precipProb: h.precipitationProbability,
    precipMm: h.precipitationMm,
    weatherCode: h.weatherCode,
    humidity: h.humidity,
    uvIndex: h.uvIndex,
    cloudCover: h.cloudCover,
    isDay: h.isDay,
  };
}

function isStormyOrSevere(code: number): boolean {
  return code >= 95 || code === 65 || code === 75 || code === 82;
}

function isWet(e: EvalInput): boolean {
  return e.precipMm >= 0.4 || e.precipProb >= 55 || (e.weatherCode >= 51 && e.weatherCode <= 86);
}

function scoreRunning(e: EvalInput, unit: TemperatureUnit): { score: number; reason: string } {
  if (isStormyOrSevere(e.weatherCode)) {
    return { score: 0, reason: 'Thunderstorms or heavy downpours make outdoor running unsafe.' };
  }
  if (e.feelsLikeC > 34) {
    return { score: 25, reason: `High heat (${formatTempWithUnit(e.feelsLikeC, unit)} feels like) raises heat-stress risk.` };
  }
  if (e.feelsLikeC < -8) {
    return { score: 30, reason: `Bitter wind chill (${formatTempWithUnit(e.feelsLikeC, unit)}) requires extreme cold gear.` };
  }
  if (isWet(e)) {
    return { score: 50, reason: `Wet pavement and ${e.precipProb}% rain chance reduce traction.` };
  }
  if (e.windKmh > 32) {
    return { score: 58, reason: `Brisk ${formatWind(e.windKmh, unit)} winds will add strong headwind drag.` };
  }
  if (e.tempC >= 7 && e.tempC <= 22 && e.humidity <= 78) {
    return { score: 95, reason: `Crisp ${formatTempWithUnit(e.tempC, unit)} air and ${formatWind(e.windKmh, unit)} breeze favor steady pacing.` };
  }
  return { score: 76, reason: `Comfortable conditions with ${formatTempWithUnit(e.tempC, unit)} and ${e.humidity}% humidity.` };
}

function scoreCycling(e: EvalInput, unit: TemperatureUnit): { score: number; reason: string } {
  if (isStormyOrSevere(e.weatherCode) || e.gustsKmh >= 50) {
    return { score: 10, reason: `Dangerous gusts (${formatWind(e.gustsKmh, unit)}) or storm cells threaten bike stability.` };
  }
  if (isWet(e)) {
    return { score: 35, reason: `Slick roads and ${e.precipProb}% precipitation chance reduce braking grip.` };
  }
  if (e.windKmh >= 28) {
    return { score: 52, reason: `Crosswinds at ${formatWind(e.windKmh, unit)} will require extra handling effort.` };
  }
  if (e.tempC < 4 || e.feelsLikeC > 35) {
    return { score: 55, reason: `Feels like ${formatTempWithUnit(e.feelsLikeC, unit)} makes sustained saddle time uncomfortable.` };
  }
  return { score: 92, reason: `Dry roads and calm ${formatWind(e.windKmh, unit)} wind support smooth rides.` };
}

function scoreHiking(e: EvalInput, unit: TemperatureUnit): { score: number; reason: string } {
  if (isStormyOrSevere(e.weatherCode)) {
    return { score: 5, reason: 'Lightning or severe weather makes exposed ridges and trails hazardous.' };
  }
  if (e.weatherCode === 45 || e.weatherCode === 48) {
    return { score: 45, reason: 'Dense fog limits trail visibility and scenic outlooks.' };
  }
  if (isWet(e)) {
    return { score: 42, reason: `Rain risk (${e.precipProb}%) may leave dirt trails muddy and slippery.` };
  }
  if (e.uvIndex >= 8 && e.isDay) {
    return { score: 70, reason: `UV index is high (${e.uvIndex.toFixed(0)}); pack sun protection and extra water.` };
  }
  if (e.tempC >= 8 && e.tempC <= 26) {
    return { score: 94, reason: `Pleasant ${formatTempWithUnit(e.tempC, unit)} trail weather with clear footing.` };
  }
  return { score: 68, reason: `Layer appropriately for ${formatTempWithUnit(e.feelsLikeC, unit)} feels-like temperatures.` };
}

function scorePicnic(e: EvalInput, unit: TemperatureUnit): { score: number; reason: string } {
  if (isStormyOrSevere(e.weatherCode) || isWet(e)) {
    return { score: 15, reason: `Rain probability (${e.precipProb}%) or wet grounds spoil open-air dining.` };
  }
  if (!e.isDay) {
    return { score: 45, reason: 'Sun has set; outdoor park seating will be cool and dim.' };
  }
  if (e.windKmh >= 26) {
    return { score: 48, reason: `Gusty ${formatWind(e.windKmh, unit)} breeze makes blankets and napkins hard to manage.` };
  }
  if (e.tempC < 14 || e.tempC > 32) {
    return { score: 50, reason: `Ambient ${formatTempWithUnit(e.tempC, unit)} is outside peak lounging comfort.` };
  }
  return { score: 93, reason: `Dry grass, ${formatTempWithUnit(e.tempC, unit)} warmth, and gentle wind suit park gatherings.` };
}

function scoreWaterSports(e: EvalInput, unit: TemperatureUnit): { score: number; reason: string } {
  if (e.weatherCode >= 95) {
    return { score: 0, reason: 'Active lightning risk makes all open-water activity strictly unsafe.' };
  }
  if (e.gustsKmh >= 40 || e.windKmh >= 30) {
    return { score: 25, reason: `Choppy surface conditions from ${formatWind(e.windKmh, unit)} winds.` };
  }
  if (!e.isDay || e.tempC < 17) {
    return { score: 40, reason: `Cool ${formatTempWithUnit(e.tempC, unit)} air makes paddling or swimming brisk.` };
  }
  if (isWet(e)) {
    return { score: 52, reason: 'Passing showers reduce visibility on lakes and coastal water.' };
  }
  return { score: 90, reason: `Warm ${formatTempWithUnit(e.tempC, unit)} air and calm ${formatWind(e.windKmh, unit)} winds for flat water.` };
}

function scorePhotography(e: EvalInput, unit: TemperatureUnit): { score: number; reason: string } {
  if (e.weatherCode >= 95 || e.precipMm >= 4) {
    return { score: 25, reason: 'Heavy rain or storm gusts put camera optics at risk.' };
  }
  if (e.weatherCode === 45 || e.weatherCode === 48) {
    return { score: 78, reason: 'Atmospheric morning or evening fog creates moody compositions.' };
  }
  if (e.cloudCover >= 25 && e.cloudCover <= 75) {
    return { score: 94, reason: `Broken cloud cover (${e.cloudCover}%) diffuses harsh glare for rich sky texture.` };
  }
  if (e.windKmh >= 35) {
    return { score: 58, reason: `${formatWind(e.windKmh, unit)} wind may shake tripods during long exposures.` };
  }
  return { score: 85, reason: `Clean air and ${formatTempWithUnit(e.tempC, unit)} allow comfortable outdoor shooting.` };
}

function scoreStargazing(e: EvalInput, unit: TemperatureUnit): { score: number; reason: string } {
  if (e.isDay) {
    return { score: 42, reason: 'Daylight right now—check tonight’s clear-sky window after sunset.' };
  }
  if (e.weatherCode >= 51) {
    return { score: 10, reason: 'Precipitation and overcast skies block night sky visibility.' };
  }
  if (e.cloudCover > 65) {
    return { score: 28, reason: `${e.cloudCover}% cloud cover obscures most stars and planets.` };
  }
  if (e.cloudCover <= 25) {
    return { score: 95, reason: `Clear dark skies (${e.cloudCover}% clouds) and ${formatTempWithUnit(e.tempC, unit)} night air.` };
  }
  return { score: 65, reason: `Partly cloudy (${e.cloudCover}%) with periodic breaks for constellations.` };
}

function scoreToSuitability(score: number): ActivitySuitability {
  if (score >= 75) return 'Ideal';
  if (score >= 48) return 'Fair';
  return 'Avoid';
}

function findBestWindow(
  hourly: HourlyForecastPoint[],
  scorer: (e: EvalInput, unit: TemperatureUnit) => { score: number; reason: string },
  unit: TemperatureUnit,
  preferNight = false
): string {
  const candidates = hourly.slice(0, 18).filter((h) => (preferNight ? !h.isDay : true));
  if (candidates.length === 0) return 'Check tomorrow evening';

  let bestHour = candidates[0];
  let bestScore = -1;
  for (const h of candidates) {
    const res = scorer(hourlyToEval(h), unit);
    if (res.score > bestScore) {
      bestScore = res.score;
      bestHour = h;
    }
  }

  if (bestScore < 48) {
    return 'No optimal window in next 18h';
  }
  return `Best around ${formatHourLabel(bestHour.timeIso)}`;
}

export function predictActivities(
  current: CurrentWeatherData,
  hourly: HourlyForecastPoint[],
  unit: TemperatureUnit
): ActivityPrediction[] {
  const nowEval = currentToEval(current);

  const specs = [
    {
      id: 'running',
      name: 'Running & Jogging',
      category: 'Active' as const,
      scorer: scoreRunning,
      preferNight: false,
      summary: `${formatTempWithUnit(current.temperatureC, unit)} · ${current.humidity}% humidity`,
    },
    {
      id: 'cycling',
      name: 'Road Cycling',
      category: 'Active' as const,
      scorer: scoreCycling,
      preferNight: false,
      summary: `Wind ${formatWind(current.windSpeedKmh, unit)} · Gusts ${formatWind(current.windGustsKmh, unit)}`,
    },
    {
      id: 'hiking',
      name: 'Hiking & Trails',
      category: 'Active' as const,
      scorer: scoreHiking,
      preferNight: false,
      summary: `${current.precipitationProbability}% precip · UV ${current.uvIndex.toFixed(0)}`,
    },
    {
      id: 'picnic',
      name: 'Picnic & Park Lounge',
      category: 'Leisure' as const,
      scorer: scorePicnic,
      preferNight: false,
      summary: `Feels like ${formatTempWithUnit(current.apparentTemperatureC, unit)}`,
    },
    {
      id: 'water',
      name: 'Kayaking & Paddle',
      category: 'Water' as const,
      scorer: scoreWaterSports,
      preferNight: false,
      summary: `Wind ${formatWind(current.windSpeedKmh, unit)} · ${formatTempWithUnit(current.temperatureC, unit)}`,
    },
    {
      id: 'photography',
      name: 'Outdoor Photography',
      category: 'Leisure' as const,
      scorer: scorePhotography,
      preferNight: false,
      summary: `${current.cloudCover}% cloud cover · ${current.visibilityKm.toFixed(0)} km vis`,
    },
    {
      id: 'stargazing',
      name: 'Night Stargazing',
      category: 'Evening' as const,
      scorer: scoreStargazing,
      preferNight: true,
      summary: `${current.cloudCover}% clouds`,
    },
  ];

  return specs.map((spec) => {
    const currentEval = spec.scorer(nowEval, unit);
    const suitability = scoreToSuitability(currentEval.score);
    const bestWindow = findBestWindow(hourly, spec.scorer, unit, spec.preferNight);
    return {
      id: spec.id,
      name: spec.name,
      category: spec.category,
      suitability,
      reason: currentEval.reason,
      bestWindow,
      conditionsSummary: spec.summary,
    };
  });
}

export function estimateCloudCoverFromWmo(code: number): number {
  if (code === 0) return 8;
  if (code === 1) return 22;
  if (code === 2) return 55;
  if (code === 3) return 90;
  if (code === 45 || code === 48) return 85;
  if (code >= 51) return 92;
  return 40;
}

export function predictDailyActivities(
  day: DailyForecastPoint,
  unit: TemperatureUnit
): ActivityPrediction[] {
  const cloudCover = estimateCloudCoverFromWmo(day.weatherCode);
  const isWetCode = day.weatherCode >= 51 && day.weatherCode <= 99;
  const estPrecipRate = isWetCode
    ? Math.max(day.precipitationSumMm / 6, 0.6)
    : day.precipitationSumMm / 12;
  const daytimeTempC = day.tempMinC + (day.tempMaxC - day.tempMinC) * 0.72;

  const dayEval: EvalInput = {
    tempC: daytimeTempC,
    feelsLikeC: daytimeTempC,
    windKmh: day.windSpeedMaxKmh,
    gustsKmh: day.windGustsMaxKmh,
    precipProb: day.precipitationProbabilityMax,
    precipMm: estPrecipRate,
    weatherCode: day.weatherCode,
    humidity: isWetCode ? 82 : 54,
    uvIndex: day.uvIndexMax,
    cloudCover,
    isDay: true,
  };

  const nightEval: EvalInput = {
    ...dayEval,
    tempC: day.tempMinC,
    feelsLikeC: day.tempMinC,
    isDay: false,
  };

  const specs = [
    {
      id: 'running',
      name: 'Running & Jogging',
      category: 'Active' as const,
      scorer: scoreRunning,
      evalInput: dayEval,
      summary: `High ${formatTempWithUnit(day.tempMaxC, unit)} · ${day.precipitationProbabilityMax}% rain`,
      window: 'Morning or late afternoon',
    },
    {
      id: 'cycling',
      name: 'Road Cycling',
      category: 'Active' as const,
      scorer: scoreCycling,
      evalInput: dayEval,
      summary: `Wind ${formatWind(day.windSpeedMaxKmh, unit)} · Gusts ${formatWind(day.windGustsMaxKmh, unit)}`,
      window: day.windSpeedMaxKmh < 24 ? 'Midday to afternoon' : 'Early morning calmer winds',
    },
    {
      id: 'hiking',
      name: 'Hiking & Trails',
      category: 'Active' as const,
      scorer: scoreHiking,
      evalInput: dayEval,
      summary: `${day.precipitationProbabilityMax}% precip · UV ${day.uvIndexMax.toFixed(0)}`,
      window: day.uvIndexMax >= 6 ? 'Before 10 AM or after 4 PM' : 'Daylight hours',
    },
    {
      id: 'picnic',
      name: 'Picnic & Park Lounge',
      category: 'Leisure' as const,
      scorer: scorePicnic,
      evalInput: dayEval,
      summary: `${formatTempWithUnit(day.tempMinC, unit)}–${formatTempWithUnit(day.tempMaxC, unit)}`,
      window: 'Midday to early afternoon',
    },
    {
      id: 'water',
      name: 'Kayaking & Paddle',
      category: 'Water' as const,
      scorer: scoreWaterSports,
      evalInput: dayEval,
      summary: `Wind ${formatWind(day.windSpeedMaxKmh, unit)} · High ${formatTempWithUnit(day.tempMaxC, unit)}`,
      window: 'Morning flat-water window',
    },
    {
      id: 'photography',
      name: 'Outdoor Photography',
      category: 'Leisure' as const,
      scorer: scorePhotography,
      evalInput: dayEval,
      summary: `${cloudCover}% est. clouds`,
      window: 'Golden hour near sunrise/sunset',
    },
    {
      id: 'stargazing',
      name: 'Night Stargazing',
      category: 'Evening' as const,
      scorer: scoreStargazing,
      evalInput: nightEval,
      summary: `Low ${formatTempWithUnit(day.tempMinC, unit)} · ${cloudCover}% clouds`,
      window: 'After astronomical twilight',
    },
  ];

  return specs.map((spec) => {
    const res = spec.scorer(spec.evalInput, unit);
    return {
      id: spec.id,
      name: spec.name,
      category: spec.category,
      suitability: scoreToSuitability(res.score),
      reason: res.reason,
      bestWindow: spec.window,
      conditionsSummary: spec.summary,
    };
  });
}
