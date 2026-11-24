import { useEffect, useMemo, useState } from 'react';
import { Gauge, RefreshCw } from 'lucide-react';
import {
  computeForecastConfidence,
  ConfidenceWindow,
  fetchMultiModelDataset,
  MultiModelDataset,
} from '../services/multiModelConfidenceApi';
import { formatTempWithUnit } from '../services/weatherApi';
import { CityLocation, TemperatureUnit } from '../types/weather';

interface ForecastConfidenceMeterProps {
  location: CityLocation;
  unit: TemperatureUnit;
}

export function ForecastConfidenceMeter({ location, unit }: ForecastConfidenceMeterProps) {
  const [windowChoice, setWindowChoice] = useState<ConfidenceWindow>('12h');
  const [dataset, setDataset] = useState<MultiModelDataset | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadModels = async () => {
    setLoading(true);
    setError(null);
    try {
      const ds = await fetchMultiModelDataset(location.latitude, location.longitude);
      setDataset(ds);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to compare weather models.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadModels();
  }, [location.id, location.latitude, location.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  const confidence = useMemo(() => {
    if (!dataset) return null;
    return computeForecastConfidence(dataset, windowChoice, unit);
  }, [dataset, windowChoice, unit]);

  const meterColor =
    confidence?.tier === 'High'
      ? 'bg-emerald-500'
      : confidence?.tier === 'Moderate'
        ? 'bg-amber-400'
        : 'bg-red-500';

  const tierTextColor =
    confidence?.tier === 'High'
      ? 'text-emerald-300'
      : confidence?.tier === 'Moderate'
        ? 'text-amber-300'
        : 'text-red-300';

  return (
    <section
      aria-label="Interactive multi-model forecast confidence meter"
      className="bg-slate-900/90 border border-slate-800 rounded-lg overflow-hidden"
    >
      <div className="px-4 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-sky-400 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="font-display text-base font-semibold text-white">
              Forecast Confidence Meter
            </h2>
            <p className="text-xs text-slate-400">
              Live consensus across ECMWF IFS, NOAA GFS, and DWD ICON models
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="Confidence time window"
            className="inline-flex items-center p-0.5 bg-slate-950 border border-slate-800 rounded-lg"
          >
            {(['6h', '12h', '24h'] as ConfidenceWindow[]).map((win) => (
              <button
                key={win}
                type="button"
                aria-pressed={windowChoice === win}
                onClick={() => setWindowChoice(win)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  windowChoice === win
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Next {win}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void loadModels()}
            disabled={loading}
            aria-label="Refresh model consensus"
            className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {error && (
          <div className="text-xs text-red-300 bg-red-950/50 border border-red-800/70 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {!confidence && loading && (
          <div className="text-xs text-slate-400 py-3">
            Comparing ECMWF, GFS, and ICON model runs for {location.name}...
          </div>
        )}

        {confidence && (
          <>
            <div className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className={`text-sm font-semibold ${tierTextColor}`}>
                  {confidence.headline}
                </span>
                <span className="text-xs font-mono-tabular text-slate-300">
                  Agreement Score: <strong className="text-white">{confidence.score}%</strong>
                </span>
              </div>

              <div className="h-2.5 w-full bg-slate-950 border border-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${meterColor}`}
                  style={{ width: `${confidence.score}%` }}
                />
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">{confidence.explanation}</p>
            </div>

            {/* 3-Model Breakdown Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {confidence.models.map((m) => (
                <div
                  key={m.id}
                  className="bg-slate-950/75 border border-slate-800 rounded-lg p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-white">{m.name}</span>
                    <span className="text-[10px] text-slate-400">{m.agency}</span>
                  </div>
                  <div className="text-xs font-mono-tabular text-sky-300 font-medium">
                    {formatTempWithUnit(m.tempMinC, unit)} – {formatTempWithUnit(m.tempMaxC, unit)}
                  </div>
                  <div className="text-[11px] text-slate-300">{m.summary}</div>
                  <div className="text-[11px] font-mono-tabular text-slate-400">
                    Rain odds {m.maxPrecipProb}% · {m.totalPrecipMm.toFixed(1)} mm total
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
