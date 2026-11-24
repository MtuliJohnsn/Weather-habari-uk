import {
  AlertSeverity,
  CityLocation,
  CurrentWeatherData,
  DailyForecastPoint,
  HourlyForecastPoint,
  TemperatureUnit,
  WeatherAlert,
  WeatherBundle,
} from '../types/weather';

export const DEFAULT_CITIES: CityLocation[] = [
  {
    id: 'san-francisco-us',
    name: 'San Francisco',
    admin1: 'California',
    country: 'United States',
    countryCode: 'US',
    latitude: 37.7749,
    longitude: -122.4194,
    timezone: 'America/Los_Angeles',
  },
  {
    id: 'new-york-us',
    name: 'New York',
    admin1: 'New York',
    country: 'United States',
    countryCode: 'US',
    latitude: 40.7128,
    longitude: -74.006,
    timezone: 'America/New_York',
  },
  {
    id: 'london-gb',
    name: 'London',
    admin1: 'England',
    country: 'United Kingdom',
    countryCode: 'GB',
    latitude: 51.5074,
    longitude: -0.1278,
    timezone: 'Europe/London',
  },
  {
    id: 'tokyo-jp',
    name: 'Tokyo',
    admin1: 'Tokyo',
    country: 'Japan',
    countryCode: 'JP',
    latitude: 35.6762,
    longitude: 139.6503,
    timezone: 'Asia/Tokyo',
  },
];

export function cToF(tempC: number): number {
  return (tempC * 9) / 5 + 32;
}

export function formatTemp(tempC: number, unit: TemperatureUnit): string {
  const val = unit === 'F' ? cToF(tempC) : tempC;
  return `${Math.round(val)}°`;
}

export function formatTempWithUnit(tempC: number, unit: TemperatureUnit): string {
  const val = unit === 'F' ? cToF(tempC) : tempC;
  return `${Math.round(val)}°${unit}`;
}

export function formatWind(kmh: number, unit: TemperatureUnit): string {
  if (unit === 'F') {
    const mph = kmh * 0.621371;
    return `${Math.round(mph)} mph`;
  }
  return `${Math.round(kmh)} km/h`;
}

export function formatVisibility(km: number, unit: TemperatureUnit): string {
  if (unit === 'F') {
    const miles = km * 0.621371;
    return `${miles.toFixed(1)} mi`;
  }
  return `${km.toFixed(1)} km`;
}

export function describeWeatherCode(code: number): string {
  if (code === 0) return 'Clear sky';
  if (code === 1) return 'Mainly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if (code === 51 || code === 53 || code === 55) return 'Drizzle';
  if (code === 56 || code === 57) return 'Freezing drizzle';
  if (code === 61) return 'Light rain';
  if (code === 63) return 'Moderate rain';
  if (code === 65) return 'Heavy rain';
  if (code === 66 || code === 67) return 'Freezing rain';
  if (code === 71) return 'Light snow';
  if (code === 73) return 'Moderate snow';
  if (code === 75) return 'Heavy snow';
  if (code === 77) return 'Snow grains';
  if (code === 80 || code === 81) return 'Rain showers';
  if (code === 82) return 'Violent rain showers';
  if (code === 85 || code === 86) return 'Snow showers';
  if (code === 95) return 'Thunderstorm';
  if (code === 96 || code === 99) return 'Thunderstorm with hail';
  return 'Variable conditions';
}

export function getCompassDirection(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(((deg % 360) / 45)) % 8;
  return dirs[index];
}

export interface UvRiskInfo {
  level: 'Low' | 'Moderate' | 'High' | 'Very High' | 'Extreme';
  isHigh: boolean;
  guidance: string;
}

export function getUvRiskInfo(uvIndex: number): UvRiskInfo {
  if (uvIndex >= 11) {
    return {
      level: 'Extreme',
      isHigh: true,
      guidance:
        'Unprotected skin can burn in minutes. Apply broad-spectrum SPF 50+, wear UV sunglasses, a wide-brim hat, and seek shade between 10 AM and 4 PM.',
    };
  }
  if (uvIndex >= 8) {
    return {
      level: 'Very High',
      isHigh: true,
      guidance:
        'Extra sun protection required. Wear broad-spectrum SPF 30–50+ sunscreen, UPF clothing, sunglasses, and limit direct midday sun.',
    };
  }
  if (uvIndex >= 6) {
    return {
      level: 'High',
      isHigh: true,
      guidance:
        'Sun protection recommended. Apply broad-spectrum SPF 30+ sunscreen, wear sunglasses and a hat, and take shade breaks during peak hours.',
    };
  }
  if (uvIndex >= 3) {
    return {
      level: 'Moderate',
      isHigh: false,
      guidance: 'Moderate UV exposure. Sunglasses and SPF 30+ advised for extended midday outings.',
    };
  }
  return {
    level: 'Low',
    isHigh: false,
    guidance: 'Minimal sun protection required for brief outdoor exposure.',
  };
}

export async function searchCities(query: string): Promise<CityLocation[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', trimmed);
  url.searchParams.set('count', '8');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error('Could not search locations right now.');
  }

  const data = await res.json();
  if (!Array.isArray(data.results)) return [];

  return data.results.map((item: {
    id: number;
    name: string;
    admin1?: string;
    country?: string;
    country_code?: string;
    latitude: number;
    longitude: number;
    timezone?: string;
  }) => ({
    id: `${item.id}`,
    name: item.name,
    admin1: item.admin1,
    country: item.country || item.country_code || '',
    countryCode: item.country_code,
    latitude: item.latitude,
    longitude: item.longitude,
    timezone: item.timezone,
  }));
}

export async function reverseGeocodeCity(
  latitude: number,
  longitude: number
): Promise<CityLocation> {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat', latitude.toString());
    url.searchParams.set('lon', longitude.toString());
    url.searchParams.set('format', 'jsonv2');
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      const addr = data.address || {};
      const city =
        addr.city ||
        addr.town ||
        addr.village ||
        addr.municipality ||
        addr.county ||
        'Current Location';
      return {
        id: `geo-${latitude.toFixed(3)}-${longitude.toFixed(3)}`,
        name: city,
        admin1: addr.state || addr.region,
        country: addr.country || 'Local Area',
        countryCode: addr.country_code ? String(addr.country_code).toUpperCase() : undefined,
        latitude,
        longitude,
      };
    }
  } catch {
    // Fallback to coordinate label if reverse geocode fails
  }

  return {
    id: `geo-${latitude.toFixed(3)}-${longitude.toFixed(3)}`,
    name: 'Current Location',
    country: `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`,
    latitude,
    longitude,
  };
}

function mapNwsSeverity(severity?: string): AlertSeverity {
  if (severity === 'Extreme') return 'Extreme';
  if (severity === 'Severe') return 'Severe';
  if (severity === 'Moderate') return 'Moderate';
  return 'Advisory';
}

function inferAlertCategory(eventName: string): WeatherAlert['category'] {
  const lower = eventName.toLowerCase();
  if (lower.includes('thunder') || lower.includes('tornado') || lower.includes('storm') || lower.includes('lightning')) {
    return 'storm';
  }
  if (lower.includes('wind') || lower.includes('gale')) return 'wind';
  if (lower.includes('heat') || lower.includes('excessive')) return 'heat';
  if (lower.includes('freeze') || lower.includes('cold') || lower.includes('frost') || lower.includes('chill')) {
    return 'cold';
  }
  if (lower.includes('flood') || lower.includes('rain') || lower.includes('snow') || lower.includes('blizzard') || lower.includes('winter')) {
    return 'precipitation';
  }
  return 'storm';
}

async function fetchNwsAlerts(location: CityLocation): Promise<WeatherAlert[]> {
  if (location.countryCode && location.countryCode !== 'US') {
    return [];
  }

  try {
    const pointStr = `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}`;
    const res = await fetch(`https://api.weather.gov/alerts/active?point=${pointStr}`, {
      headers: { Accept: 'application/geo+json' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data.features)) return [];

    return data.features.slice(0, 5).map((feature: {
      id?: string;
      properties?: {
        event?: string;
        severity?: string;
        headline?: string;
        description?: string;
        effective?: string;
        expires?: string;
      };
    }, idx: number) => {
      const p = feature.properties || {};
      const title = p.event || 'Weather Alert';
      return {
        id: feature.id || `nws-${idx}`,
        title,
        severity: mapNwsSeverity(p.severity),
        source: 'NWS' as const,
        headline: p.headline || title,
        description: (p.description || 'Check local official guidance for full details.').slice(0, 360),
        effectiveIso: p.effective,
        expiresIso: p.expires,
        category: inferAlertCategory(title),
      };
    });
  } catch {
    return [];
  }
}

export function deriveMeteorologicalAlerts(
  current: CurrentWeatherData,
  hourly: HourlyForecastPoint[],
  unit: TemperatureUnit
): WeatherAlert[] {
  const alerts: WeatherAlert[] = [];
  const next12 = hourly.slice(0, 12);

  // Thunderstorm or severe hail check
  const stormHour = next12.find((h) => h.weatherCode >= 95);
  if (current.weatherCode >= 95 || stormHour) {
    alerts.push({
      id: 'met-thunderstorm',
      title: 'Thunderstorm Warning',
      severity: current.weatherCode >= 96 || (stormHour?.weatherCode ?? 0) >= 96 ? 'Extreme' : 'Severe',
      source: 'Meteorological',
      headline:
        current.weatherCode >= 95
          ? 'Active thunderstorm conditions detected in your area.'
          : 'Thunderstorms forecast within the next 12 hours.',
      description:
        'Seek sturdy shelter during lightning and avoid open fields, high terrain, and bodies of water.',
      category: 'storm',
    });
  }

  // High wind / gust check
  const maxGust = Math.max(current.windGustsKmh, ...next12.map((h) => h.windGustsKmh));
  if (maxGust >= 60) {
    alerts.push({
      id: 'met-high-wind',
      title: 'High Wind Advisory',
      severity: maxGust >= 85 ? 'Severe' : 'Moderate',
      source: 'Meteorological',
      headline: `Wind gusts reaching ${formatWind(maxGust, unit)} expected locally.`,
      description:
        'Secure loose outdoor gear and use caution when cycling, driving high-profile vehicles, or walking near trees.',
      category: 'wind',
    });
  }

  // Extreme heat check
  const maxFeelsC = Math.max(
    current.apparentTemperatureC,
    ...next12.map((h) => h.apparentTemperatureC)
  );
  if (maxFeelsC >= 37) {
    alerts.push({
      id: 'met-extreme-heat',
      title: 'Excessive Heat Advisory',
      severity: maxFeelsC >= 41 ? 'Severe' : 'Moderate',
      source: 'Meteorological',
      headline: `Feels-like temperature reaching ${formatTempWithUnit(maxFeelsC, unit)}.`,
      description:
        'Limit strenuous midday exertion, stay hydrated, and shift outdoor workouts to early morning or after sunset.',
      category: 'heat',
    });
  }

  // Extreme cold / freezing check
  const minFeelsC = Math.min(
    current.apparentTemperatureC,
    ...next12.map((h) => h.apparentTemperatureC)
  );
  if (minFeelsC <= -5) {
    alerts.push({
      id: 'met-extreme-cold',
      title: 'Cold & Freeze Advisory',
      severity: minFeelsC <= -15 ? 'Severe' : 'Moderate',
      source: 'Meteorological',
      headline: `Wind chill dropping to ${formatTempWithUnit(minFeelsC, unit)}.`,
      description:
        'Wear layered thermal protection, cover exposed skin, and watch for icy patches on roads and trails.',
      category: 'cold',
    });
  }

  // Heavy rain or snow
  const heavyPrecipHour = next12.find(
    (h) => h.precipitationMm >= 6 || h.weatherCode === 65 || h.weatherCode === 75 || h.weatherCode === 82
  );
  if (heavyPrecipHour || current.precipitationMm >= 6) {
    alerts.push({
      id: 'met-heavy-precip',
      title: 'Heavy Precipitation Alert',
      severity: 'Moderate',
      source: 'Meteorological',
      headline: 'Heavy rainfall or snow bursts expected in the next 12 hours.',
      description:
        'Expect reduced visibility, slick pavement, and localized ponding in low-lying areas.',
      category: 'precipitation',
    });
  }

  return alerts;
}

export async function fetchWeatherForCity(
  location: CityLocation,
  unitForAlertCopy: TemperatureUnit = 'C'
): Promise<WeatherBundle> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', location.latitude.toString());
  url.searchParams.set('longitude', location.longitude.toString());
  url.searchParams.set(
    'current',
    [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'is_day',
      'precipitation',
      'weather_code',
      'cloud_cover',
      'pressure_msl',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m',
    ].join(',')
  );
  url.searchParams.set(
    'hourly',
    [
      'temperature_2m',
      'relative_humidity_2m',
      'dew_point_2m',
      'apparent_temperature',
      'precipitation_probability',
      'precipitation',
      'weather_code',
      'cloud_cover',
      'visibility',
      'wind_speed_10m',
      'wind_gusts_10m',
      'uv_index',
      'is_day',
    ].join(',')
  );
  url.searchParams.set(
    'daily',
    [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'sunrise',
      'sunset',
      'uv_index_max',
      'precipitation_sum',
      'precipitation_probability_max',
      'wind_speed_10m_max',
      'wind_gusts_10m_max',
    ].join(',')
  );
  url.searchParams.set('timezone', 'auto');
  url.searchParams.set('forecast_days', '7');

  const [forecastRes, nwsAlerts] = await Promise.all([
    fetch(url.toString()),
    fetchNwsAlerts(location),
  ]);

  if (!forecastRes.ok) {
    throw new Error(`Unable to load forecast for ${location.name}.`);
  }

  const data = await forecastRes.json();
  const c = data.current || {};
  const h = data.hourly || {};
  const d = data.daily || {};

  // Find current hour index to get hourly-only fields (uv_index, visibility, dew_point, precip prob)
  const currentTimePrefix = typeof c.time === 'string' ? c.time.slice(0, 13) : '';
  const hourlyTimes: string[] = h.time || [];
  let startIdx = hourlyTimes.findIndex((t) => t.startsWith(currentTimePrefix));
  if (startIdx < 0) startIdx = 0;

  const current: CurrentWeatherData = {
    temperatureC: Number(c.temperature_2m ?? 0),
    apparentTemperatureC: Number(c.apparent_temperature ?? c.temperature_2m ?? 0),
    humidity: Number(c.relative_humidity_2m ?? 0),
    dewPointC: Number(h.dew_point_2m?.[startIdx] ?? 0),
    precipitationMm: Number(c.precipitation ?? 0),
    precipitationProbability: Number(h.precipitation_probability?.[startIdx] ?? 0),
    weatherCode: Number(c.weather_code ?? 0),
    isDay: Boolean(c.is_day ?? 1),
    windSpeedKmh: Number(c.wind_speed_10m ?? 0),
    windGustsKmh: Number(c.wind_gusts_10m ?? c.wind_speed_10m ?? 0),
    windDirectionDeg: Number(c.wind_direction_10m ?? 0),
    pressureHpa: Number(c.pressure_msl ?? 1013),
    uvIndex: Number(h.uv_index?.[startIdx] ?? 0),
    visibilityKm: Number((h.visibility?.[startIdx] ?? 10000) / 1000),
    cloudCover: Number(c.cloud_cover ?? 0),
    observationTimeIso: c.time || new Date().toISOString(),
  };

  const hourly: HourlyForecastPoint[] = [];
  for (let i = startIdx; i < Math.min(startIdx + 24, hourlyTimes.length); i++) {
    hourly.push({
      timeIso: hourlyTimes[i],
      temperatureC: Number(h.temperature_2m?.[i] ?? 0),
      apparentTemperatureC: Number(h.apparent_temperature?.[i] ?? 0),
      precipitationProbability: Number(h.precipitation_probability?.[i] ?? 0),
      precipitationMm: Number(h.precipitation?.[i] ?? 0),
      weatherCode: Number(h.weather_code?.[i] ?? 0),
      windSpeedKmh: Number(h.wind_speed_10m?.[i] ?? 0),
      windGustsKmh: Number(h.wind_gusts_10m?.[i] ?? 0),
      uvIndex: Number(h.uv_index?.[i] ?? 0),
      humidity: Number(h.relative_humidity_2m?.[i] ?? 0),
      cloudCover: Number(h.cloud_cover?.[i] ?? 0),
      isDay: Boolean(h.is_day?.[i] ?? 1),
    });
  }

  const dailyTimes: string[] = d.time || [];
  const daily: DailyForecastPoint[] = dailyTimes.map((dateIso, i) => ({
    dateIso,
    weatherCode: Number(d.weather_code?.[i] ?? 0),
    tempMaxC: Number(d.temperature_2m_max?.[i] ?? 0),
    tempMinC: Number(d.temperature_2m_min?.[i] ?? 0),
    precipitationProbabilityMax: Number(d.precipitation_probability_max?.[i] ?? 0),
    precipitationSumMm: Number(d.precipitation_sum?.[i] ?? 0),
    windSpeedMaxKmh: Number(d.wind_speed_10m_max?.[i] ?? 0),
    windGustsMaxKmh: Number(d.wind_gusts_10m_max?.[i] ?? 0),
    uvIndexMax: Number(d.uv_index_max?.[i] ?? 0),
    sunriseIso: d.sunrise?.[i] || '',
    sunsetIso: d.sunset?.[i] || '',
  }));

  const metAlerts = deriveMeteorologicalAlerts(current, hourly, unitForAlertCopy);
  const alerts: WeatherAlert[] = [...nwsAlerts, ...metAlerts];

  return {
    location: {
      ...location,
      timezone: data.timezone || location.timezone,
    },
    timezone: data.timezone || 'UTC',
    utcOffsetSeconds: Number(data.utc_offset_seconds ?? 0),
    current,
    hourly,
    daily,
    alerts,
    fetchedAtIso: new Date().toISOString(),
  };
}
