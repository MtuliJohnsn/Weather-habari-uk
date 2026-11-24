import {
  Droplets,
  Eye,
  Gauge,
  Sun,
  Sunrise,
  Sunset,
  Thermometer,
  Umbrella,
  Wind,
} from 'lucide-react';
import {
  describeWeatherCode,
  formatTemp,
  formatTempWithUnit,
  formatVisibility,
  formatWind,
  getCompassDirection,
  getUvRiskInfo,
} from '../services/weatherApi';
import { TemperatureUnit, WeatherBundle } from '../types/weather';
import { calculateSolarTimes } from '../utils/solarTimes';
import { WeatherIcon } from './WeatherIcon';

interface CurrentWeatherHeroProps {
  bundle: WeatherBundle;
  unit: TemperatureUnit;
  onRefresh: () => void;
  isRefreshing: boolean;
}

function formatHourShort(iso: string): string {
  const timePart = iso.split('T')[1] || '00:00';
  const hour = Number(timePart.split(':')[0]);
  if (hour === 0) return '12a';
  if (hour === 12) return '12p';
  return hour > 12 ? `${hour - 12}p` : `${hour}a`;
}

export function CurrentWeatherHero({
  bundle,
  unit,
  onRefresh,
  isRefreshing,
}: CurrentWeatherHeroProps) {
  const { location, current, hourly, daily, timezone, utcOffsetSeconds } = bundle;
  const today = daily[0];
  const conditionText = describeWeatherCode(current.weatherCode);
  const uvRisk = getUvRiskInfo(current.uvIndex);
  const peakUvToday = today ? today.uvIndexMax : current.uvIndex;
  const peakUvRisk = getUvRiskInfo(peakUvToday);
  const uvScalePct = Math.min((current.uvIndex / 12) * 100, 100);
  const solar = calculateSolarTimes(
    location.latitude,
    location.longitude,
    timezone,
    utcOffsetSeconds
  );

  const metrics = [
    {
      label: 'Wind',
      value: `${formatWind(current.windSpeedKmh, unit)} ${getCompassDirection(current.windDirectionDeg)}`,
      detail: `Gusts ${formatWind(current.windGustsKmh, unit)}`,
      icon: Wind,
    },
    {
      label: 'Humidity',
      value: `${current.humidity}%`,
      detail: `Dew pt ${formatTempWithUnit(current.dewPointC, unit)}`,
      icon: Droplets,
    },
    {
      label: 'Rain Chance',
      value: `${current.precipitationProbability}%`,
      detail: `${current.precipitationMm.toFixed(1)} mm now`,
      icon: Umbrella,
    },
    {
      label: 'UV Index',
      value: `${current.uvIndex.toFixed(1)} · ${uvRisk.level}`,
      detail: `Peak today ${peakUvToday.toFixed(1)} (${peakUvRisk.level})`,
      icon: Sun,
      accent: uvRisk.isHigh ? 'text-amber-300' : 'text-white',
    },
    {
      label: 'Visibility',
      value: formatVisibility(current.visibilityKm, unit),
      detail: `${current.cloudCover}% clouds`,
      icon: Eye,
    },
    {
      label: 'Pressure',
      value: `${Math.round(current.pressureHpa)} hPa`,
      detail: current.pressureHpa >= 1015 ? 'High pressure' : 'Low pressure',
      icon: Gauge,
    },
  ];

  return (
    <section aria-label="Detailed current weather" className="space-y-4 text-slate-100">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
            <WeatherIcon code={current.weatherCode} isDay={current.isDay} className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-baseline gap-2.5">
              <span className="font-display text-3xl font-semibold text-white tabular-nums">
                {formatTempWithUnit(current.temperatureC, unit)}
              </span>
              <span className="text-sm font-medium text-slate-300">{conditionText}</span>
            </div>
            <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-3 mt-0.5 tabular-nums">
              <span className="inline-flex items-center gap-1">
                <Thermometer className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                Feels {formatTempWithUnit(current.apparentTemperatureC, unit)}
              </span>
              {today && (
                <span>
                  H {formatTempWithUnit(today.tempMaxC, unit)} / L{' '}
                  {formatTempWithUnit(today.tempMinC, unit)}
                </span>
              )}
              <span>{location.name}</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 self-start sm:self-center"
        >
          {isRefreshing ? 'Updating...' : 'Refresh Telemetry'}
        </button>
      </div>

      {/* Hairline-Divided Metric Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-slate-800 border border-slate-800 rounded-lg bg-slate-900/90">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="p-3.5 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
                <span>{metric.label}</span>
                <Icon
                  className={`w-3.5 h-3.5 ${
                    metric.label === 'UV Index' && uvRisk.isHigh
                      ? 'text-amber-400'
                      : 'text-slate-500'
                  }`}
                  aria-hidden="true"
                />
              </div>
              <div
                className={`text-sm font-semibold tabular-nums ${
                  metric.accent || 'text-white'
                }`}
              >
                {metric.value}
              </div>
              <div className="text-[11px] text-slate-400 tabular-nums">{metric.detail}</div>
            </div>
          );
        })}
      </div>

      {/* Sunrise & Sunset Solar Telemetry (Calculated from Lat/Lon) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-800 border border-slate-800 rounded-lg bg-slate-900/90">
        <div className="px-4 py-3 flex items-center gap-3">
          <Sunrise className="w-5 h-5 text-amber-400 shrink-0" aria-hidden="true" />
          <div>
            <div className="text-[11px] font-medium text-slate-400">Sunrise</div>
            <div className="text-sm font-semibold text-white font-mono-tabular">
              {solar.sunriseLabel}
            </div>
          </div>
        </div>

        <div className="px-4 py-3 flex items-center gap-3">
          <Sunset className="w-5 h-5 text-orange-400 shrink-0" aria-hidden="true" />
          <div>
            <div className="text-[11px] font-medium text-slate-400">Sunset</div>
            <div className="text-sm font-semibold text-white font-mono-tabular">
              {solar.sunsetLabel}
            </div>
          </div>
        </div>

        <div className="px-4 py-3 flex flex-col justify-center">
          <div className="text-[11px] font-medium text-slate-400">Solar Window</div>
          <div className="text-xs font-medium text-slate-200 tabular-nums mt-0.5">
            {solar.daylightDurationLabel} · {location.latitude.toFixed(2)}°,{' '}
            {location.longitude.toFixed(2)}°
          </div>
        </div>
      </div>

      {/* UV Index Exposure Bar */}
      <div className="px-4 py-3 border border-slate-800 rounded-lg bg-slate-900/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Sun
            className={`w-4 h-4 shrink-0 ${
              uvRisk.isHigh ? 'text-amber-400' : 'text-sky-400'
            }`}
            aria-hidden="true"
          />
          <div className="text-xs text-slate-300">
            <span className="font-semibold text-white tabular-nums">
              UV Index {current.uvIndex.toFixed(1)} ({uvRisk.level})
            </span>
            <span className="text-slate-500 mx-1.5" aria-hidden="true">
              ·
            </span>
            <span>{uvRisk.guidance}</span>
          </div>
        </div>
        <div className="w-full sm:w-44 shrink-0 space-y-1">
          <div className="flex justify-between text-[10px] font-mono-tabular text-slate-400">
            <span>0</span>
            <span>6 High</span>
            <span>11+</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden relative">
            <div
              className={`h-full rounded-full transition-all ${
                current.uvIndex >= 8
                  ? 'bg-red-500'
                  : current.uvIndex >= 6
                    ? 'bg-amber-500'
                    : current.uvIndex >= 3
                      ? 'bg-yellow-400'
                      : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.max(uvScalePct, 4)}%` }}
            />
          </div>
        </div>
      </div>

      {/* 24-Hour Strip */}
      <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
        {hourly.slice(0, 14).map((hour, idx) => (
          <div
            key={hour.timeIso}
            className={`min-w-[64px] flex flex-col items-center justify-between gap-1 py-2 px-1.5 rounded-lg border ${
              idx === 0
                ? 'bg-slate-800 border-sky-500/60'
                : 'bg-slate-900/80 border-slate-800'
            }`}
          >
            <span className="text-[11px] font-medium text-slate-400 tabular-nums">
              {idx === 0 ? 'Now' : formatHourShort(hour.timeIso)}
            </span>
            <WeatherIcon code={hour.weatherCode} isDay={hour.isDay} className="w-4 h-4" />
            <span className="text-xs font-semibold text-white tabular-nums">
              {formatTemp(hour.temperatureC, unit)}
            </span>
            <span className="text-[10px] font-mono-tabular text-sky-400">
              {hour.precipitationProbability}%
            </span>
            <span
              className={`text-[10px] font-mono-tabular ${
                hour.uvIndex >= 6 ? 'text-amber-400' : 'text-slate-400'
              }`}
            >
              UV {Math.round(hour.uvIndex)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
