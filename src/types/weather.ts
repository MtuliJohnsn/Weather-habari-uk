export type TemperatureUnit = 'C' | 'F';

export interface CityLocation {
  id: string;
  name: string;
  admin1?: string;
  country: string;
  countryCode?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

export interface CurrentWeatherData {
  temperatureC: number;
  apparentTemperatureC: number;
  humidity: number;
  dewPointC: number;
  precipitationMm: number;
  precipitationProbability: number;
  weatherCode: number;
  isDay: boolean;
  windSpeedKmh: number;
  windGustsKmh: number;
  windDirectionDeg: number;
  pressureHpa: number;
  uvIndex: number;
  visibilityKm: number;
  cloudCover: number;
  observationTimeIso: string;
}

export interface HourlyForecastPoint {
  timeIso: string;
  temperatureC: number;
  apparentTemperatureC: number;
  precipitationProbability: number;
  precipitationMm: number;
  weatherCode: number;
  windSpeedKmh: number;
  windGustsKmh: number;
  uvIndex: number;
  humidity: number;
  cloudCover: number;
  isDay: boolean;
}

export interface DailyForecastPoint {
  dateIso: string;
  weatherCode: number;
  tempMaxC: number;
  tempMinC: number;
  precipitationProbabilityMax: number;
  precipitationSumMm: number;
  windSpeedMaxKmh: number;
  windGustsMaxKmh: number;
  uvIndexMax: number;
  sunriseIso: string;
  sunsetIso: string;
}

export type AlertSeverity = 'Extreme' | 'Severe' | 'Moderate' | 'Advisory';

export interface WeatherAlert {
  id: string;
  title: string;
  severity: AlertSeverity;
  source: 'NWS' | 'Meteorological';
  headline: string;
  description: string;
  effectiveIso?: string;
  expiresIso?: string;
  category: 'wind' | 'storm' | 'heat' | 'cold' | 'precipitation' | 'uv';
}

export interface WeatherBundle {
  location: CityLocation;
  timezone: string;
  utcOffsetSeconds: number;
  current: CurrentWeatherData;
  hourly: HourlyForecastPoint[];
  daily: DailyForecastPoint[];
  alerts: WeatherAlert[];
  fetchedAtIso: string;
}

export type ActivitySuitability = 'Ideal' | 'Fair' | 'Avoid';
export type ActivityCategory = 'Active' | 'Leisure' | 'Water' | 'Evening';

export interface ActivityPrediction {
  id: string;
  name: string;
  category: ActivityCategory;
  suitability: ActivitySuitability;
  reason: string;
  bestWindow: string;
  conditionsSummary: string;
}

export interface AlertPreferences {
  enabled: boolean;
  notifyStorms: boolean;
  notifyHighWind: boolean;
  notifyExtremeTemp: boolean;
  notifyHeavyPrecip: boolean;
}
