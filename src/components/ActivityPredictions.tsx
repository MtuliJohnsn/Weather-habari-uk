import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bike,
  Bug,
  Camera,
  Car,
  CheckCircle2,
  Clock,
  Droplets,
  Footprints,
  Home,
  MinusCircle,
  Mountain,
  Shirt,
  Sparkles,
  Sun,
  Trees,
  Waves,
  Wind,
} from 'lucide-react';
import { getUvRiskInfo } from '../services/weatherApi';
import {
  ActivityCategory,
  ActivityPrediction,
  ActivitySuitability,
  DailyForecastPoint,
  TemperatureUnit,
  WeatherBundle,
} from '../types/weather';
import { predictActivities, predictDailyActivities } from '../utils/activityPredictor';
import { computeLifestyleGuide } from '../utils/lifestyleGuide';

interface ActivityPredictionsProps {
  bundle: WeatherBundle;
  unit: TemperatureUnit;
  selectedDay?: DailyForecastPoint | null;
  selectedDayLabel?: string;
  onResetToLive?: () => void;
}

type FilterOption = 'All' | 'Ideal' | ActivityCategory;

const ACTIVITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  running: Footprints,
  cycling: Bike,
  hiking: Mountain,
  picnic: Trees,
  water: Waves,
  photography: Camera,
  stargazing: Sparkles,
};

function SuitabilityIndicator({ status }: { status: ActivitySuitability }) {
  if (status === 'Ideal') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 whitespace-nowrap shrink-0">
        <CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />
        <span>Ideal</span>
      </span>
    );
  }
  if (status === 'Fair') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 whitespace-nowrap shrink-0">
        <MinusCircle className="w-4 h-4 text-amber-400" aria-hidden="true" />
        <span>Fair</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-400 whitespace-nowrap shrink-0">
      <AlertTriangle className="w-4 h-4 text-red-400" aria-hidden="true" />
      <span>Not Ideal</span>
    </span>
  );
}

export function ActivityPredictions({
  bundle,
  unit,
  selectedDay,
  selectedDayLabel,
  onResetToLive,
}: ActivityPredictionsProps) {
  const [filter, setFilter] = useState<FilterOption>('All');

  const predictions = useMemo<ActivityPrediction[]>(() => {
    if (selectedDay) {
      return predictDailyActivities(selectedDay, unit);
    }
    return predictActivities(bundle.current, bundle.hourly, unit);
  }, [bundle.current, bundle.hourly, selectedDay, unit]);

  const lifestyleGuide = useMemo(() => {
    if (selectedDay) return null;
    return computeLifestyleGuide(bundle.current, bundle.hourly, unit);
  }, [bundle.current, bundle.hourly, selectedDay, unit]);

  const idealCount = predictions.filter((p) => p.suitability === 'Ideal').length;
  const currentUv = selectedDay ? selectedDay.uvIndexMax : bundle.current.uvIndex;
  const peakNextHoursUv = selectedDay
    ? selectedDay.uvIndexMax
    : Math.max(currentUv, ...bundle.hourly.slice(0, 6).map((h) => h.uvIndex));
  const effectiveUv = Math.max(currentUv, peakNextHoursUv);
  const uvRisk = getUvRiskInfo(effectiveUv);

  const filtered = predictions.filter((item) => {
    if (filter === 'All') return true;
    if (filter === 'Ideal') return item.suitability === 'Ideal';
    return item.category === filter;
  });

  const filterTabs: { id: FilterOption; label: string }[] = [
    { id: 'All', label: 'All Activities' },
    { id: 'Ideal', label: `${selectedDay ? 'Ideal' : 'Ideal Now'} (${idealCount})` },
    { id: 'Active', label: 'Active' },
    { id: 'Leisure', label: 'Leisure' },
    { id: 'Water', label: 'Water' },
  ];

  return (
    <section aria-label="Outside activity predictions and lifestyle guide" className="space-y-5 text-slate-100">
      {lifestyleGuide && (
        <div className="space-y-3 pb-4 border-b border-slate-800">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-white">
                Smart Lifestyle &amp; Outfit Guide
              </h2>
              <p className="text-xs text-slate-400">
                Practical clothing, daily timing windows, and comfort indexes for {bundle.location.name}
              </p>
            </div>
          </div>

          {/* Outfit & Wind-Chill Recommendation */}
          <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-sky-600/20 border border-sky-500/40 text-sky-300 flex items-center justify-center shrink-0">
                <Shirt className="w-4 h-4" aria-hidden="true" />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="text-sm font-semibold text-white">
                  {lifestyleGuide.outfit.headline}
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {lifestyleGuide.outfit.layers}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400 font-mono-tabular">
                  <span className="inline-flex items-center gap-1 text-sky-300">
                    <Wind className="w-3 h-3" aria-hidden="true" />
                    <span>{lifestyleGuide.outfit.windChillNote}</span>
                  </span>
                  <span>·</span>
                  <span>Gear: {lifestyleGuide.outfit.accessories}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Best Window Today Strip */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {lifestyleGuide.bestWindows.map((win) => {
              const WinIcon =
                win.id === 'dog-walk' ? Footprints : win.id === 'car-wash' ? Car : Home;
              const verdictColor =
                win.verdict === 'Great Today'
                  ? 'text-emerald-400'
                  : win.verdict === 'Short Window'
                    ? 'text-amber-300'
                    : 'text-slate-400';

              return (
                <div
                  key={win.id}
                  className="p-3 rounded-lg bg-slate-950/75 border border-slate-800 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white">
                      <WinIcon className="w-3.5 h-3.5 text-sky-400 shrink-0" aria-hidden="true" />
                      <span>{win.title}</span>
                    </span>
                    <span className={`text-[11px] font-semibold shrink-0 ${verdictColor}`}>
                      {win.verdict}
                    </span>
                  </div>
                  <div className="text-xs font-semibold font-mono-tabular text-sky-300">
                    {win.windowLabel}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{win.detail}</p>
                </div>
              );
            })}
          </div>

          {/* Frizz / UV / Mosquito Activity Indexes */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {lifestyleGuide.indexes.map((metric) => {
              const MetricIcon =
                metric.id === 'frizz' ? Droplets : metric.id === 'uv' ? Sun : Bug;
              const barColor =
                metric.score >= 72
                  ? 'bg-red-500'
                  : metric.score >= 48
                    ? 'bg-amber-400'
                    : 'bg-emerald-500';
              const levelTone =
                metric.score >= 72
                  ? 'text-red-300'
                  : metric.score >= 48
                    ? 'text-amber-300'
                    : 'text-emerald-300';

              return (
                <div
                  key={metric.id}
                  className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white">
                      <MetricIcon className="w-3.5 h-3.5 text-sky-400 shrink-0" aria-hidden="true" />
                      <span>{metric.label}</span>
                    </span>
                    <span className={`text-[11px] font-semibold font-mono-tabular ${levelTone}`}>
                      {metric.level} ({metric.score})
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                      style={{ width: `${metric.score}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{metric.guidance}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="font-display text-lg font-semibold text-white">
              Outside Activity Predictions
            </h2>
            {selectedDay && selectedDayLabel && onResetToLive && (
              <button
                type="button"
                onClick={onResetToLive}
                className="text-xs font-medium text-sky-400 hover:text-sky-300 transition-colors whitespace-nowrap"
              >
                {selectedDayLabel} · Reset to Live
              </button>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {selectedDay && selectedDayLabel
              ? `Forecast suitability for ${selectedDayLabel} in ${bundle.location.name}`
              : `Local suitability in ${bundle.location.name} based on temperature, wind, precipitation, and UV`}
            <span aria-hidden="true"> · </span>
            <span className="font-medium text-slate-200 tabular-nums">
              {idealCount} of {predictions.length} ideal {selectedDay ? 'that day' : 'right now'}
            </span>
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Filter outdoor activities"
          className="inline-flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg overflow-x-auto max-w-full"
        >
          {filterTabs.map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(tab.id)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {uvRisk.isHigh && (
        <div
          role="note"
          aria-label="Sun protection recommendation"
          className="p-3.5 rounded-lg border border-amber-500/60 bg-amber-950/60 flex items-start gap-3"
        >
          <Sun className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-0.5">
            <div className="text-xs font-semibold text-amber-200 tabular-nums">
              Sun-Protection Recommendation · UV Index {effectiveUv.toFixed(1)} ({uvRisk.level})
            </div>
            <p className="text-xs text-amber-100/90 leading-relaxed">
              {uvRisk.guidance}
            </p>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="p-6 rounded-lg bg-slate-900/90 border border-slate-800 text-center">
          <p className="text-sm text-slate-300">
            No activities are rated Ideal right now due to local weather conditions.
          </p>
          <button
            type="button"
            onClick={() => setFilter('All')}
            className="mt-3 px-3.5 py-1.5 text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors"
          >
            View All Activities
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-x divide-slate-800 border border-slate-800 rounded-lg bg-slate-900/90 overflow-hidden">
          {filtered.map((activity) => {
            const Icon = ACTIVITY_ICONS[activity.id] || Footprints;
            return (
              <div
                key={activity.id}
                className="p-4 flex flex-col justify-between gap-2.5 hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-slate-800 text-sky-300 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-white truncate">
                        {activity.name}
                      </h3>
                      <p className="text-xs text-slate-400 tabular-nums">
                        {activity.category} · {activity.conditionsSummary}
                      </p>
                    </div>
                  </div>
                  <SuitabilityIndicator status={activity.suitability} />
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">{activity.reason}</p>

                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                  <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
                  <span className="tabular-nums">{activity.bestWindow}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
