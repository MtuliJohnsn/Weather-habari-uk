import { CurrentWeatherData, HourlyForecastPoint, TemperatureUnit } from '../types/weather';

export async function fetchAiDailySummary(params: {
  cityName: string;
  unit: TemperatureUnit;
  current: CurrentWeatherData;
  hourly: HourlyForecastPoint[];
}): Promise<string> {
  const res = await fetch('/api/daily-summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const payload = (await res.json().catch(() => ({}))) as { summary?: string; error?: string };
  if (!res.ok) {
    throw new Error(payload.error || `Unable to generate daily summary (HTTP ${res.status}).`);
  }
  return payload.summary || '';
}
