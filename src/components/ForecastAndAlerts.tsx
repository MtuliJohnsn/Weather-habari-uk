import type { User } from 'firebase/auth';
import { useMemo } from 'react';
import {
  Activity,
  AlertOctagon,
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  ChevronRight,
  RotateCcw,
  ShieldAlert,
  Sun,
  Sunrise,
  Umbrella,
  Wind,
} from 'lucide-react';
import { ThresholdAlertRule } from '../services/thresholdAlertsService';
import {
  describeWeatherCode,
  formatTemp,
  formatTempWithUnit,
  formatWind,
  getUvRiskInfo,
} from '../services/weatherApi';
import {
  AlertPreferences,
  TemperatureUnit,
  WeatherBundle,
} from '../types/weather';
import { predictDailyActivities } from '../utils/activityPredictor';
import { BrowserPermissionState } from '../utils/notifications';
import { CustomThresholdRules } from './CustomThresholdRules';
import { ForecastConfidenceMeter } from './ForecastConfidenceMeter';
import { WeatherIcon } from './WeatherIcon';

interface ForecastAndAlertsProps {
  bundle: WeatherBundle;
  unit: TemperatureUnit;
  selectedDayIndex: number;
  onSelectDay: (index: number) => void;
  alertPrefs: AlertPreferences;
  permissionState: BrowserPermissionState;
  onEnablePushAlerts: () => Promise<void>;
  onTogglePref: (key: keyof AlertPreferences) => void;
  onSendTestNotification: () => void;
  authUser: User | null;
  thresholdRules: ThresholdAlertRule[];
  onAddThresholdRule: (rule: Omit<ThresholdAlertRule, 'id'>) => Promise<void>;
  onToggleThresholdRule: (rule: ThresholdAlertRule) => Promise<void>;
  onDeleteThresholdRule: (ruleId: string) => Promise<void>;
  onTestThresholdRule: (rule: ThresholdAlertRule) => Promise<void>;
}

function formatDayName(dateIso: string, index: number): string {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(dt);
}

function formatShortDate(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(dt);
}

function formatFullDayLabel(dateIso: string, index: number): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const formatted = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(dt);
  if (index === 0) return `Today · ${formatted}`;
  if (index === 1) return `Tomorrow · ${formatted}`;
  return formatted;
}

function formatIsoClock12h(iso?: string): string {
  if (!iso || !iso.includes('T')) return '—';
  const timePart = iso.split('T')[1];
  const [hStr, mStr] = timePart.split(':');
  const h24 = Number(hStr);
  const mins = Number(mStr);
  if (Number.isNaN(h24) || Number.isNaN(mins)) return '—';
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(mins).padStart(2, '0')} ${period}`;
}

function formatDaylightDuration(sunriseIso?: string, sunsetIso?: string): string {
  if (!sunriseIso?.includes('T') || !sunsetIso?.includes('T')) return 'Solar window';
  const [rh, rm] = sunriseIso.split('T')[1].split(':').map(Number);
  const [sh, sm] = sunsetIso.split('T')[1].split(':').map(Number);
  if ([rh, rm, sh, sm].some((v) => Number.isNaN(v))) return 'Solar window';
  let diff = sh * 60 + sm - (rh * 60 + rm);
  if (diff < 0) diff += 1440;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return `${h}h ${String(m).padStart(2, '0')}m daylight`;
}

export function ForecastAndAlerts({
  bundle,
  unit,
  selectedDayIndex,
  onSelectDay,
  alertPrefs,
  permissionState,
  onEnablePushAlerts,
  onTogglePref,
  onSendTestNotification,
  authUser,
  thresholdRules,
  onAddThresholdRule,
  onToggleThresholdRule,
  onDeleteThresholdRule,
  onTestThresholdRule,
}: ForecastAndAlertsProps) {
  const { daily, alerts, location } = bundle;

  const safeSelectedIndex = Math.min(selectedDayIndex, Math.max(daily.length - 1, 0));
  const selectedDay = daily[safeSelectedIndex];
  const selectedUvRisk = selectedDay ? getUvRiskInfo(selectedDay.uvIndexMax) : null;
  const selectedActivities = useMemo(() => {
    if (!selectedDay) return [];
    const rank = { Ideal: 0, Fair: 1, Avoid: 2 };
    return [...predictDailyActivities(selectedDay, unit)].sort(
      (a, b) => rank[a.suitability] - rank[b.suitability]
    );
  }, [selectedDay, unit]);

  const weekMin = daily.length > 0 ? Math.min(...daily.map((d) => d.tempMinC)) : 0;
  const weekMax = daily.length > 0 ? Math.max(...daily.map((d) => d.tempMaxC)) : 1;
  const weekSpan = Math.max(weekMax - weekMin, 1);

  const toggleOptions: { key: keyof Omit<AlertPreferences, 'enabled'>; label: string; detail: string }[] = [
    {
      key: 'notifyStorms',
      label: 'Thunderstorms & Lightning',
      detail: 'Immediate alert for active or incoming storm cells',
    },
    {
      key: 'notifyHighWind',
      label: 'High Wind Gusts',
      detail: 'Advisory when gusts exceed 60 km/h (37 mph)',
    },
    {
      key: 'notifyExtremeTemp',
      label: 'Extreme Heat or Freeze',
      detail: 'Feels-like temperatures ≥ 37°C (99°F) or ≤ -5°C (23°F)',
    },
    {
      key: 'notifyHeavyPrecip',
      label: 'Heavy Rain & Snowfall',
      detail: 'Intense precipitation bursts affecting visibility or travel',
    },
  ];

  return (
    <div className="space-y-5 text-slate-100">
      {/* Interactive Multi-Model Forecast Confidence Meter */}
      <ForecastConfidenceMeter location={location} unit={unit} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* 7-Day Forecast Table + Selected Day Breakdown */}
        <section
          aria-label="7-day weather forecast"
          className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-lg overflow-hidden"
        >
        <div className="px-4 py-3.5 border-b border-slate-800 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-white">7-Day Outlook</h2>
            <p className="text-xs text-slate-400">
              Press any day to animate its weather &amp; activities on the 3D station
            </p>
          </div>
          <span className="text-xs font-medium text-slate-400 whitespace-nowrap shrink-0">
            Unit: °{unit}
          </span>
        </div>

        <div className="divide-y divide-slate-800/80" role="listbox" aria-label="Choose a forecast day">
          {daily.map((day, index) => {
            const leftPct = ((day.tempMinC - weekMin) / weekSpan) * 100;
            const widthPct = Math.max(((day.tempMaxC - day.tempMinC) / weekSpan) * 100, 8);
            const isSelected = index === safeSelectedIndex;
            return (
              <button
                key={day.dateIso}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => onSelectDay(index)}
                className={`w-full text-left px-4 py-2.5 grid grid-cols-12 items-center gap-2 transition-colors ${
                  isSelected ? 'bg-slate-800/90' : 'hover:bg-slate-800/45'
                }`}
              >
                <div className="col-span-3 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-xs font-semibold truncate ${
                        isSelected ? 'text-sky-300' : 'text-white'
                      }`}
                    >
                      {formatDayName(day.dateIso, index)}
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono-tabular hidden sm:inline">
                      {formatShortDate(day.dateIso)}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    {describeWeatherCode(day.weatherCode)}
                  </div>
                </div>

                <div className="col-span-2 flex items-center gap-1.5">
                  <WeatherIcon code={day.weatherCode} isDay={true} className="w-4 h-4 shrink-0" />
                  <span className="text-xs font-mono-tabular text-sky-400">
                    {day.precipitationProbabilityMax}%
                  </span>
                </div>

                <div className="col-span-5 flex items-center gap-2">
                  <span className="text-xs font-mono-tabular text-slate-400 w-7 text-right shrink-0">
                    {formatTemp(day.tempMinC, unit)}
                  </span>
                  <div className="flex-1 h-1.5 bg-slate-800 rounded-full relative overflow-hidden">
                    <div
                      className={`absolute top-0 bottom-0 rounded-full ${
                        isSelected ? 'bg-sky-400' : 'bg-sky-500/80'
                      }`}
                      style={{
                        left: `${leftPct}%`,
                        width: `${widthPct}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono-tabular font-semibold text-white w-7 shrink-0">
                    {formatTemp(day.tempMaxC, unit)}
                  </span>
                </div>

                <div className="col-span-2 flex items-center justify-end gap-1 text-xs font-mono-tabular text-slate-400">
                  <span>{formatWind(day.windSpeedMaxKmh, unit)}</span>
                  <ChevronRight
                    className={`w-3.5 h-3.5 transition-colors shrink-0 ${
                      isSelected ? 'text-sky-400' : 'text-slate-600'
                    }`}
                    aria-hidden="true"
                  />
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Day Details & Outdoor Activities */}
        {selectedDay && selectedUvRisk && (
          <div className="border-t border-slate-700/80 bg-slate-950/75" aria-live="polite">
            <div className="px-4 py-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <WeatherIcon
                  code={selectedDay.weatherCode}
                  isDay={true}
                  className="w-6 h-6 shrink-0"
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-white truncate">
                      {formatFullDayLabel(selectedDay.dateIso, safeSelectedIndex)}
                    </h3>
                    {safeSelectedIndex > 0 ? (
                      <button
                        type="button"
                        onClick={() => onSelectDay(0)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-400 hover:text-sky-300 transition-colors whitespace-nowrap shrink-0"
                      >
                        <RotateCcw className="w-3 h-3" aria-hidden="true" />
                        <span>Back to Live</span>
                      </button>
                    ) : (
                      <span className="text-[11px] font-medium text-emerald-400 whitespace-nowrap">
                        Live on Station
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    {describeWeatherCode(selectedDay.weatherCode)} · {location.name}
                  </p>
                </div>
              </div>

              <div className="flex items-baseline gap-3 font-mono-tabular text-xs shrink-0">
                <span className="text-slate-400">
                  High{' '}
                  <strong className="text-sm font-semibold text-white">
                    {formatTempWithUnit(selectedDay.tempMaxC, unit)}
                  </strong>
                </span>
                <span className="text-slate-600">/</span>
                <span className="text-slate-400">
                  Low{' '}
                  <strong className="text-sm font-semibold text-slate-200">
                    {formatTempWithUnit(selectedDay.tempMinC, unit)}
                  </strong>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-800 border-t border-slate-800">
              <div className="p-3.5 space-y-1">
                <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
                  <span>Precipitation</span>
                  <Umbrella className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
                </div>
                <div className="text-sm font-semibold text-white font-mono-tabular">
                  {selectedDay.precipitationProbabilityMax}% chance
                </div>
                <div className="text-[11px] text-slate-400 font-mono-tabular">
                  {selectedDay.precipitationSumMm.toFixed(1)} mm expected
                </div>
              </div>

              <div className="p-3.5 space-y-1">
                <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
                  <span>Peak Wind</span>
                  <Wind className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                </div>
                <div className="text-sm font-semibold text-white font-mono-tabular">
                  {formatWind(selectedDay.windSpeedMaxKmh, unit)}
                </div>
                <div className="text-[11px] text-slate-400 font-mono-tabular">
                  Gusts {formatWind(selectedDay.windGustsMaxKmh, unit)}
                </div>
              </div>

              <div className="p-3.5 space-y-1">
                <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
                  <span>Max UV Index</span>
                  <Sun
                    className={`w-3.5 h-3.5 ${
                      selectedUvRisk.isHigh ? 'text-amber-400' : 'text-slate-400'
                    }`}
                    aria-hidden="true"
                  />
                </div>
                <div
                  className={`text-sm font-semibold font-mono-tabular ${
                    selectedUvRisk.isHigh ? 'text-amber-300' : 'text-white'
                  }`}
                >
                  {selectedDay.uvIndexMax.toFixed(1)} · {selectedUvRisk.level}
                </div>
                <div className="text-[11px] text-slate-400">
                  {selectedUvRisk.isHigh ? 'SPF 30+ & shade advised' : 'Low-moderate UV'}
                </div>
              </div>

              <div className="p-3.5 space-y-1">
                <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
                  <span>Sunrise / Sunset</span>
                  <Sunrise className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                </div>
                <div className="text-xs font-semibold text-white font-mono-tabular">
                  {formatIsoClock12h(selectedDay.sunriseIso)} /{' '}
                  {formatIsoClock12h(selectedDay.sunsetIso)}
                </div>
                <div className="text-[11px] text-slate-400 font-mono-tabular">
                  {formatDaylightDuration(selectedDay.sunriseIso, selectedDay.sunsetIso)}
                </div>
              </div>
            </div>

            {selectedUvRisk.isHigh && (
              <div className="px-4 py-2.5 border-t border-slate-800 flex items-start gap-2 text-xs text-amber-200/90">
                <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{selectedUvRisk.guidance}</span>
              </div>
            )}

            {/* Recommended Outdoor Activities for Selected Day */}
            <div className="px-4 py-3 border-t border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                  <Activity className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
                  <span>Outdoor Activities for {formatDayName(selectedDay.dateIso, safeSelectedIndex)}</span>
                </span>
                <span className="text-[11px] text-slate-400 font-mono-tabular">
                  {selectedActivities.filter((a) => a.suitability === 'Ideal').length} Ideal
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                {selectedActivities.slice(0, 6).map((act) => {
                  const statusTone =
                    act.suitability === 'Ideal'
                      ? 'text-emerald-400'
                      : act.suitability === 'Fair'
                        ? 'text-amber-400'
                        : 'text-red-400';
                  const statusLabel = act.suitability === 'Avoid' ? 'Not Ideal' : act.suitability;
                  return (
                    <div key={act.id} className="min-w-0 py-1 border-b border-slate-800/60">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-white truncate">{act.name}</span>
                        <span className={`text-[11px] font-semibold shrink-0 ${statusTone}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">{act.reason}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Severe Weather Push Notifications & Active Advisories */}
      <section
        aria-label="Severe weather push alerts"
        className="lg:col-span-5 bg-slate-900/90 border border-slate-800 rounded-lg overflow-hidden"
      >
        <div className="px-4 py-3.5 border-b border-slate-800 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-base font-semibold text-white">
              Severe Weather Alerts
            </h2>
            <p className="text-xs text-slate-400">Push notifications for {location.name}</p>
          </div>
          {alertPrefs.enabled && permissionState === 'granted' ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 whitespace-nowrap shrink-0">
              <BellRing className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Push Active</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 whitespace-nowrap shrink-0">
              <BellOff className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Off</span>
            </span>
          )}
        </div>

        <div className="p-4 space-y-4">
          {alerts.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-red-400 flex items-center gap-1.5">
                <AlertOctagon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>
                  {alerts.length} Active {alerts.length === 1 ? 'Advisory' : 'Advisories'}
                </span>
              </div>
              <div className="divide-y divide-red-900/60 border border-red-800/80 rounded-lg bg-red-950/60">
                {alerts.map((alert) => (
                  <div key={alert.id} className="p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-red-100">{alert.title}</span>
                      <span className="text-[11px] font-medium text-red-300 whitespace-nowrap shrink-0">
                        {alert.severity} · {alert.source}
                      </span>
                    </div>
                    <p className="text-xs text-red-200">{alert.headline}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-3 border border-slate-800 rounded-lg bg-slate-950/60 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="text-xs font-medium text-white">No severe weather alerts active</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Conditions in {location.name} are below severe thresholds.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onEnablePushAlerts}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                alertPrefs.enabled
                  ? 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700'
                  : 'bg-sky-600 text-white hover:bg-sky-500'
              }`}
            >
              <Bell className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{alertPrefs.enabled ? 'Pause Push Alerts' : 'Enable Push Alerts'}</span>
            </button>

            <button
              type="button"
              onClick={onSendTestNotification}
              className="px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
              <span>Send Test Alert</span>
            </button>
          </div>

          {permissionState === 'denied' && (
            <p className="text-[11px] text-amber-300">
              Browser notifications are blocked in site settings; severe alerts will appear in-app.
            </p>
          )}

          <div className="pt-2 border-t border-slate-800">
            <h3 className="text-xs font-semibold text-slate-400 mb-2">
              Push Notification Triggers
            </h3>
            <div className="divide-y divide-slate-800/80">
              {toggleOptions.map((opt) => (
                <label
                  key={opt.key}
                  className="py-2 flex items-center justify-between gap-3 cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-200">{opt.label}</div>
                    <div className="text-[11px] text-slate-400">{opt.detail}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={alertPrefs[opt.key]}
                    onChange={() => onTogglePref(opt.key)}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-950 text-sky-500 focus:ring-sky-500 shrink-0"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>
      </div>

      {/* Custom Plain-English Threshold Alert Rules */}
      <CustomThresholdRules
        bundle={bundle}
        unit={unit}
        user={authUser}
        rules={thresholdRules}
        onAddRule={onAddThresholdRule}
        onToggleRule={onToggleThresholdRule}
        onDeleteRule={onDeleteThresholdRule}
        onTestRuleNotification={onTestThresholdRule}
      />
    </div>
  );
}
