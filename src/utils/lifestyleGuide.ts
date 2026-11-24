import { formatTempWithUnit, formatWind } from '../services/weatherApi';
import {
  CurrentWeatherData,
  HourlyForecastPoint,
  TemperatureUnit,
} from '../types/weather';

export interface OutfitRecommendation {
  headline: string;
  layers: string;
  accessories: string;
  windChillNote: string;
}

export interface BestWindowCard {
  id: 'dog-walk' | 'car-wash' | 'open-windows';
  title: string;
  windowLabel: string;
  verdict: 'Great Today' | 'Short Window' | 'Skip Today';
  detail: string;
}

export interface LifestyleIndexMetric {
  id: 'frizz' | 'uv' | 'mosquito';
  label: string;
  score: number; // 0..100
  level: 'Low' | 'Moderate' | 'High' | 'Very High';
  guidance: string;
}

export interface SmartLifestyleGuide {
  outfit: OutfitRecommendation;
  bestWindows: BestWindowCard[];
  indexes: LifestyleIndexMetric[];
}

function formatClockRange(startIso?: string, endIso?: string): string {
  const fmt = (iso?: string) => {
    if (!iso || !iso.includes('T')) return '';
    const [hStr] = iso.split('T')[1].split(':');
    const h24 = Number(hStr);
    if (Number.isNaN(h24)) return '';
    const period = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12} ${period}`;
  };
  const s = fmt(startIso);
  const e = fmt(endIso);
  if (!s || !e) return 'Later today';
  if (s === e) return `Around ${s}`;
  return `${s} – ${e}`;
}

export function computeLifestyleGuide(
  current: CurrentWeatherData,
  hourly: HourlyForecastPoint[],
  unit: TemperatureUnit
): SmartLifestyleGuide {
  const next16 = hourly.slice(0, 16);
  const minFeelsC = Math.min(
    current.apparentTemperatureC,
    ...next16.map((h) => h.apparentTemperatureC)
  );
  const maxFeelsC = Math.max(
    current.apparentTemperatureC,
    ...next16.map((h) => h.apparentTemperatureC)
  );
  const peakGustKmh = Math.max(current.windGustsKmh, ...next16.map((h) => h.windGustsKmh));
  const peakRainProb = Math.max(
    current.precipitationProbability,
    ...next16.map((h) => h.precipitationProbability)
  );
  const peakRainMm = Math.max(current.precipitationMm, ...next16.map((h) => h.precipitationMm));

  // 1. Wind-Chill Outfit Recommendation
  let headline = 'Light breathable layers';
  let layers = 'Short sleeves or a light overshirt covers most of today.';
  if (minFeelsC <= 2) {
    headline = 'Insulated winter coat & warm gloves';
    layers = 'Thermal base + midweight fleece + wind-blocking coat for cold wind chill.';
  } else if (minFeelsC <= 10) {
    headline = 'Warm jacket or lined coat';
    layers = 'Sweater or flannel under a medium wind-resistant jacket.';
  } else if (minFeelsC <= 16) {
    headline = 'Light jacket or hoodie layer';
    layers = 'Long sleeves or light jacket you can peel off during warmer afternoon sun.';
  } else if (maxFeelsC >= 29) {
    headline = 'Ultralight breathable cotton or linen';
    layers = 'Light colors and moisture-wicking fabrics for peak afternoon warmth.';
  }

  const accessoriesList: string[] = [];
  if (peakRainProb >= 45 || peakRainMm >= 0.4) {
    accessoriesList.push('Compact umbrella or waterproof shell');
  }
  const peakUv = Math.max(current.uvIndex, ...next16.map((h) => h.uvIndex));
  if (peakUv >= 5) {
    accessoriesList.push('UV sunglasses & SPF 30+');
  }
  if (peakGustKmh >= 35) {
    accessoriesList.push('Windproof outer layer (avoid loose hats)');
  }
  const accessories =
    accessoriesList.length > 0 ? accessoriesList.join(' · ') : 'No special weather gear needed';

  const swingC = Math.abs(maxFeelsC - minFeelsC);
  const windChillNote = `Feels-like ${formatTempWithUnit(minFeelsC, unit)} to ${formatTempWithUnit(
    maxFeelsC,
    unit
  )} · Gusts up to ${formatWind(peakGustKmh, unit)}${
    swingC >= 7 ? ' (pack an extra evening layer)' : ''
  }`;

  // 2. Best Window Today: Walk the Dog
  const dogHours = next16.filter(
    (h) =>
      h.precipitationMm < 0.3 &&
      h.precipitationProbability < 40 &&
      h.temperatureC >= 2 &&
      h.temperatureC <= 27 &&
      h.windGustsKmh < 42
  );
  const dogCard: BestWindowCard =
    dogHours.length >= 2
      ? {
          id: 'dog-walk',
          title: 'Walk the Dog',
          windowLabel: formatClockRange(dogHours[0].timeIso, dogHours[Math.min(2, dogHours.length - 1)].timeIso),
          verdict: 'Great Today',
          detail: 'Dry pavement, comfortable paw temperatures, and manageable breeze.',
        }
      : dogHours.length === 1
        ? {
            id: 'dog-walk',
            title: 'Walk the Dog',
            windowLabel: formatClockRange(dogHours[0].timeIso, dogHours[0].timeIso),
            verdict: 'Short Window',
            detail: 'Brief dry break between showers or cooler/warmer extremes.',
          }
        : {
            id: 'dog-walk',
            title: 'Walk the Dog',
            windowLabel: 'Quick breaks only',
            verdict: 'Skip Today',
            detail: 'Wet pavement, strong gusts, or uncomfortable temperatures most of the day.',
          };

  // 3. Best Window Today: Wash the Car (looks across full available hourly horizon ~24h)
  const carDryStreak = hourly.every((h) => h.precipitationMm < 0.25 && h.precipitationProbability < 40);
  const middayDry = next16.find(
    (h) => h.isDay && h.precipitationMm < 0.2 && h.windSpeedKmh < 26 && h.humidity < 82
  );
  const carCard: BestWindowCard = carDryStreak
    ? {
        id: 'car-wash',
        title: 'Wash the Car',
        windowLabel: middayDry ? formatClockRange(middayDry.timeIso, middayDry.timeIso) : 'Anytime today',
        verdict: 'Great Today',
        detail: 'Zero rain in the 24-hour outlook — spotless finish will stay clean.',
      }
    : {
        id: 'car-wash',
        title: 'Wash the Car',
        windowLabel: 'Wait for dry stretch',
        verdict: 'Skip Today',
        detail: `Rain chances peak at ${peakRainProb}% within 24 hours — hold off on waxing.`,
      };

  // 4. Best Window Today: Open Windows
  const airHours = next16.filter(
    (h) =>
      h.temperatureC >= 15 &&
      h.temperatureC <= 24.5 &&
      h.humidity <= 72 &&
      h.precipitationMm < 0.1 &&
      h.windSpeedKmh <= 24
  );
  const windowCard: BestWindowCard =
    airHours.length >= 2
      ? {
          id: 'open-windows',
          title: 'Open Windows',
          windowLabel: formatClockRange(airHours[0].timeIso, airHours[Math.min(3, airHours.length - 1)].timeIso),
          verdict: 'Great Today',
          detail: 'Fresh low-humidity cross-breeze between comfortable indoor-outdoor temps.',
        }
      : airHours.length === 1
        ? {
            id: 'open-windows',
            title: 'Open Windows',
            windowLabel: formatClockRange(airHours[0].timeIso, airHours[0].timeIso),
            verdict: 'Short Window',
            detail: 'Quick 1-hour fresh-air exchange before humidity or chill shifts.',
          }
        : {
            id: 'open-windows',
            title: 'Open Windows',
            windowLabel: 'Keep sealed today',
            verdict: 'Skip Today',
            detail:
              current.temperatureC < 15
                ? 'Too chilly outside — keep indoor heat sealed.'
                : 'Too humid, breezy, or damp to air out comfortably.',
          };

  // 5. Hair Frizz Index (driven by dew point + humidity + gusts)
  const dewPointFactor = Math.max(0, (current.dewPointC - 8) * 4.5);
  const humFactor = Math.max(0, (current.humidity - 45) * 1.05);
  const windFactor = Math.min(20, current.windGustsKmh * 0.35);
  const frizzScore = Math.max(5, Math.min(100, Math.round(dewPointFactor + humFactor + windFactor)));
  const frizzLevel: LifestyleIndexMetric['level'] =
    frizzScore >= 75 ? 'Very High' : frizzScore >= 52 ? 'High' : frizzScore >= 28 ? 'Moderate' : 'Low';

  // 6. UV Protection Index
  const uvScore = Math.max(0, Math.min(100, Math.round((peakUv / 11) * 100)));
  const uvLevel: LifestyleIndexMetric['level'] =
    peakUv >= 8 ? 'Very High' : peakUv >= 6 ? 'High' : peakUv >= 3 ? 'Moderate' : 'Low';

  // 7. Mosquito Activity Index (warmth 16-32C + dampness/humidity + calm wind)
  const warmEnough = current.temperatureC >= 14 && current.temperatureC <= 34;
  const tempSweet = warmEnough ? Math.max(0, 40 - Math.abs(current.temperatureC - 25) * 2.2) : 0;
  const calmWindBonus = warmEnough ? Math.max(0, 32 - current.windSpeedKmh * 1.8) : 0;
  const dampBonus = warmEnough ? Math.max(0, (current.humidity - 42) * 0.6) : 0;
  const mosquitoScore = Math.max(0, Math.min(100, Math.round(tempSweet + calmWindBonus + dampBonus)));
  const mosquitoLevel: LifestyleIndexMetric['level'] =
    mosquitoScore >= 72
      ? 'Very High'
      : mosquitoScore >= 48
        ? 'High'
        : mosquitoScore >= 24
          ? 'Moderate'
          : 'Low';

  return {
    outfit: {
      headline,
      layers,
      accessories,
      windChillNote,
    },
    bestWindows: [dogCard, carCard, windowCard],
    indexes: [
      {
        id: 'frizz',
        label: 'Hair Frizz Index',
        score: frizzScore,
        level: frizzLevel,
        guidance:
          frizzScore >= 55
            ? `Dew point ${formatTempWithUnit(current.dewPointC, unit)} & ${current.humidity}% humidity — anti-humidity serum recommended.`
            : 'Low moisture bounce — styling holds well today.',
      },
      {
        id: 'uv',
        label: 'UV Exposure Index',
        score: uvScore,
        level: uvLevel,
        guidance:
          peakUv >= 6
            ? `Peak UV ${peakUv.toFixed(1)} — apply SPF 30+ and limit midday glare.`
            : `Peak UV ${peakUv.toFixed(1)} — gentle sunlight, minimal burn risk.`,
      },
      {
        id: 'mosquito',
        label: 'Mosquito Activity',
        score: mosquitoScore,
        level: mosquitoLevel,
        guidance:
          mosquitoScore >= 50
            ? 'Warm, calm, humid pockets near dusk — use repellent on patios.'
            : 'Too cool or breezy for heavy mosquito activity today.',
      },
    ],
  };
}
