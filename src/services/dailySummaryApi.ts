import { CurrentWeatherData, HourlyForecastPoint, TemperatureUnit } from '../types/weather';

function buildPlainEnglishDailySummary(
  cityName: string,
  unit: TemperatureUnit,
  current: CurrentWeatherData,
  hourly: HourlyForecastPoint[]
): string {
  const fmtTemp = (c: number) =>
    unit === 'F' ? `${Math.round((c * 9) / 5 + 32)}°F` : `${Math.round(c)}°C`;
  const fmtGust = (kmh: number) =>
    unit === 'F' ? `${Math.round(kmh * 0.621371)} mph` : `${Math.round(kmh)} km/h`;

  const formatHourLabel = (iso?: string) => {
    if (!iso || iso.length < 13) return 'later today';
    const hh = Number(iso.slice(11, 13));
    if (Number.isNaN(hh)) return 'later today';
    const period = hh >= 12 ? 'PM' : 'AM';
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${h12} ${period}`;
  };

  const windowHours = hourly.slice(0, 18);
  const wetIndex = windowHours.findIndex(
    (h) => Number(h.precipitationProbability ?? 0) >= 45 || Number(h.precipitationMm ?? 0) >= 0.4
  );
  const wetHour = wetIndex >= 0 ? windowHours[wetIndex] : null;
  const heavyWet = windowHours.some((h) => Number(h.precipitationMm ?? 0) >= 2.5);
  const stormRisk = windowHours.some((h) => Number(h.weatherCode ?? 0) >= 95);

  const nowTemp = Number(current.temperatureC ?? 15);
  const temps = [nowTemp, ...windowHours.map((h) => Number(h.temperatureC ?? nowTemp))];
  const hiC = Math.max(...temps);
  const loC = Math.min(...temps);
  const swingDeg = unit === 'F' ? Math.round(((hiC - loC) * 9) / 5) : Math.round(hiC - loC);
  const peakGust = Math.max(
    Number(current.windGustsKmh ?? 0),
    ...windowHours.map((h) => Number(h.windGustsKmh ?? 0))
  );
  const freezingRisk = loC <= 1.0;

  let sentence1: string;
  if (wetIndex === 0 || wetIndex === 1) {
    sentence1 = stormRisk
      ? `Stormy conditions move across ${cityName} shortly, so grab waterproof gear and allow extra commute time.`
      : `${heavyWet ? 'Steady rain' : 'Showers'} will track across ${cityName} right away—keep an umbrella handy if heading out.`;
  } else if (wetHour) {
    sentence1 = `Dry for now in ${cityName}, but grab an umbrella before ${formatHourLabel(wetHour.timeIso)} when ${heavyWet ? 'heavier rain arrives' : 'showers move in'}.`;
  } else {
    sentence1 = `Dry conditions hold across ${cityName} today with a daytime high near ${fmtTemp(hiC)}.`;
  }

  let sentence2: string;
  if (freezingRisk) {
    sentence2 = `Temperatures dip near ${fmtTemp(loC)} later with slick-spot potential${peakGust >= 35 ? ` and ${fmtGust(peakGust)} gusts` : ''}, so wear a warm coat.`;
  } else if (swingDeg >= (unit === 'F' ? 12 : 7)) {
    sentence2 = `Expect a ${swingDeg}°${unit} drop toward ${fmtTemp(loC)} by evening${peakGust >= 35 ? ` with gusts near ${fmtGust(peakGust)}` : ''}, so pack a jacket.`;
  } else {
    sentence2 = `Readings settle near ${fmtTemp(loC)} tonight${peakGust >= 35 ? ` with breezy ${fmtGust(peakGust)} gusts` : ' under calm, comfortable skies'}.`;
  }

  return `${sentence1} ${sentence2}`;
}

export async function fetchAiDailySummary(params: {
  cityName: string;
  unit: TemperatureUnit;
  current: CurrentWeatherData;
  hourly: HourlyForecastPoint[];
}): Promise<string> {
  return buildPlainEnglishDailySummary(
    params.cityName || 'Your Area',
    params.unit,
    params.current,
    params.hourly
  );
}
