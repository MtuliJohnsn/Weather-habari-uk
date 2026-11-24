import type { User } from 'firebase/auth';
import { Bell, CheckCircle2, CloudRain, Plus, ShieldCheck, Trash2, Zap } from 'lucide-react';
import { useState } from 'react';
import { signInWithGooglePopup } from '../firebase';
import {
  DEFAULT_RULE_PRESETS,
  evaluateThresholdRule,
  ThresholdAlertRule,
  ThresholdRuleType,
} from '../services/thresholdAlertsService';
import { formatTempWithUnit, formatWind } from '../services/weatherApi';
import { TemperatureUnit, WeatherBundle } from '../types/weather';

interface CustomThresholdRulesProps {
  bundle: WeatherBundle;
  unit: TemperatureUnit;
  user: User | null;
  rules: ThresholdAlertRule[];
  onAddRule: (rule: Omit<ThresholdAlertRule, 'id'>) => Promise<void>;
  onToggleRule: (rule: ThresholdAlertRule) => Promise<void>;
  onDeleteRule: (ruleId: string) => Promise<void>;
  onTestRuleNotification: (rule: ThresholdAlertRule) => Promise<void>;
}

export function CustomThresholdRules({
  bundle,
  unit,
  user,
  rules,
  onAddRule,
  onToggleRule,
  onDeleteRule,
  onTestRuleNotification,
}: CustomThresholdRulesProps) {
  const [ruleType, setRuleType] = useState<ThresholdRuleType>('jacket_or_umbrella');
  const [checkTime, setCheckTime] = useState<string>('07:00');
  const [tempVal, setTempVal] = useState<number>(() => (unit === 'F' ? 59 : 15));
  const [rainProb, setRainProb] = useState<number>(40);
  const [windSpeed, setWindSpeed] = useState<number>(() => (unit === 'F' ? 25 : 40));
  const [saving, setSaving] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  const buildPlainTitle = (): string => {
    const tStr = unit === 'F' ? `${tempVal}°F` : `${tempVal}°C`;
    const wStr = unit === 'F' ? `${windSpeed} mph` : `${windSpeed} km/h`;
    const clock = formatTime12h(checkTime);
    switch (ruleType) {
      case 'jacket_or_umbrella':
        return `At ${clock}: alert only if I need a jacket (<${tStr}) or umbrella (${rainProb}%+)`;
      case 'jacket':
        return `At ${clock}: alert if feels-like drops below ${tStr}`;
      case 'umbrella':
        return `At ${clock}: alert if rain chance reaches ${rainProb}%+ today`;
      case 'wind':
        return `At ${clock}: alert if wind gusts exceed ${wStr}`;
      case 'freeze':
        return `At ${clock}: alert if overnight freeze hits below ${tStr}`;
      case 'open_windows':
        return `At ${clock}: alert when fresh-air open-window weather arrives`;
    }
  };

  const handleCreateCustom = async () => {
    setSaving(true);
    try {
      const tempThresholdC = unit === 'F' ? ((tempVal - 32) * 5) / 9 : tempVal;
      const windThresholdKmh = unit === 'F' ? windSpeed / 0.621371 : windSpeed;
      await onAddRule({
        title: buildPlainTitle(),
        ruleType,
        checkTime,
        cityId: bundle.location.id,
        cityName: bundle.location.name,
        tempThresholdC,
        rainProbThreshold: rainProb,
        windThresholdKmh,
        enabled: true,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleQuickPreset = async (preset: (typeof DEFAULT_RULE_PRESETS)[number]) => {
    setSaving(true);
    try {
      await onAddRule({
        ...preset,
        cityId: bundle.location.id,
        cityName: bundle.location.name,
        enabled: true,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleGoogleSync = async () => {
    setSigningIn(true);
    try {
      await signInWithGooglePopup();
    } catch {
      // Popup closed/canceled
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <section
      aria-label="Custom threshold alerts"
      className="bg-slate-900/90 border border-slate-800 rounded-lg overflow-hidden"
    >
      <div className="px-4 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold text-white">
            Custom Threshold Alerts
          </h2>
          <p className="text-xs text-slate-400">
            Simple plain-English rules — notify only when a practical threshold is crossed
          </p>
        </div>

        {user ? (
          <span className="text-[11px] font-medium text-emerald-300 inline-flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Synced to Cloud</span>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => void handleGoogleSync()}
            disabled={signingIn}
            className="px-2.5 py-1 rounded-md bg-slate-950 border border-slate-700 hover:border-sky-500 text-[11px] font-medium text-sky-300 transition-colors"
          >
            {signingIn ? 'Connecting...' : 'Sign in to Sync Rules'}
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* One-Tap Natural-Language Presets */}
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            1-Tap Simple Rules
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DEFAULT_RULE_PRESETS.slice(0, 3).map((preset) => (
              <button
                key={preset.ruleType + preset.checkTime}
                type="button"
                disabled={saving}
                onClick={() => void handleQuickPreset(preset)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-sky-500 text-xs text-slate-200 inline-flex items-center gap-1.5 transition-colors text-left"
              >
                <Plus className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>{preset.title}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Simple Sentence Rule Composer */}
        <div className="bg-slate-950/75 border border-slate-800 rounded-lg p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-200">
            <span className="text-slate-400">Notify me at</span>
            <input
              type="time"
              aria-label="Daily check time"
              value={checkTime}
              onChange={(e) => setCheckTime(e.target.value || '07:00')}
              className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs font-mono-tabular text-white outline-none focus:border-sky-500"
            />
            <span className="text-slate-400">only if</span>
            <select
              aria-label="Condition type"
              value={ruleType}
              onChange={(e) => {
                const next = e.target.value as ThresholdRuleType;
                setRuleType(next);
                if (next === 'freeze') setTempVal(unit === 'F' ? 35 : 2);
                else if (next === 'open_windows') setTempVal(unit === 'F' ? 62 : 17);
                else setTempVal(unit === 'F' ? 59 : 15);
              }}
              className="bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1 text-xs text-white outline-none focus:border-sky-500"
            >
              <option value="jacket_or_umbrella">I need a jacket or umbrella today</option>
              <option value="jacket">It feels colder than jacket threshold</option>
              <option value="umbrella">Rain chance exceeds threshold</option>
              <option value="wind">Wind gusts exceed safe cycling/moto limit</option>
              <option value="freeze">Overnight freeze risks plants</option>
              <option value="open_windows">Fresh-air open-window comfort arrives</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {(ruleType === 'jacket_or_umbrella' ||
                ruleType === 'jacket' ||
                ruleType === 'freeze' ||
                ruleType === 'open_windows') && (
                <label className="inline-flex items-center gap-1.5 text-slate-300">
                  <span>Temp (°{unit}):</span>
                  <input
                    type="number"
                    value={tempVal}
                    onChange={(e) => setTempVal(Number(e.target.value))}
                    className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono-tabular text-white"
                  />
                </label>
              )}

              {(ruleType === 'jacket_or_umbrella' || ruleType === 'umbrella') && (
                <label className="inline-flex items-center gap-1.5 text-slate-300">
                  <span>Rain %:</span>
                  <input
                    type="number"
                    min={10}
                    max={95}
                    value={rainProb}
                    onChange={(e) => setRainProb(Number(e.target.value))}
                    className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono-tabular text-white"
                  />
                </label>
              )}

              {ruleType === 'wind' && (
                <label className="inline-flex items-center gap-1.5 text-slate-300">
                  <span>Gusts ({unit === 'F' ? 'mph' : 'km/h'}):</span>
                  <input
                    type="number"
                    min={10}
                    max={120}
                    value={windSpeed}
                    onChange={(e) => setWindSpeed(Number(e.target.value))}
                    className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs font-mono-tabular text-white"
                  />
                </label>
              )}
            </div>

            <button
              type="button"
              disabled={saving}
              onClick={() => void handleCreateCustom()}
              className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Save Rule</span>
            </button>
          </div>
        </div>

        {/* Active Rules + Live Evaluation Against Today's Forecast */}
        {rules.length === 0 ? (
          <div className="p-4 rounded-lg border border-dashed border-slate-800 text-center text-xs text-slate-400">
            No custom rules yet — tap a 1-tap rule above or create one for {bundle.location.name}.
          </div>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => {
              const evalRes = evaluateThresholdRule(rule, bundle, unit);
              return (
                <div
                  key={rule.id}
                  className={`p-3 rounded-lg border transition-colors ${
                    rule.enabled
                      ? 'bg-slate-950/80 border-slate-800'
                      : 'bg-slate-950/35 border-slate-800/50 opacity-65'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-white">{rule.title}</span>
                        <span className="text-[11px] font-mono-tabular text-slate-400">
                          · {bundle.location.name}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        {evalRes.triggered ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-amber-300">
                            <CloudRain className="w-3.5 h-3.5" />
                            <span>{evalRes.headline}:</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-300">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{evalRes.headline}:</span>
                          </span>
                        )}
                        <span className="text-slate-300">{evalRes.detail}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void onTestRuleNotification(rule)}
                        title="Preview this rule alert now"
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-medium text-sky-300 inline-flex items-center gap-1"
                      >
                        <Zap className="w-3 h-3" />
                        <span>Run</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void onToggleRule(rule)}
                        className={`px-2 py-1 rounded text-[11px] font-medium border ${
                          rule.enabled
                            ? 'bg-emerald-950/50 border-emerald-700 text-emerald-300'
                            : 'bg-slate-900 border-slate-700 text-slate-400'
                        }`}
                      >
                        {rule.enabled ? 'On' : 'Paused'}
                      </button>

                      <button
                        type="button"
                        aria-label={`Delete rule ${rule.title}`}
                        onClick={() => void onDeleteRule(rule.id)}
                        className="p-1 rounded text-slate-400 hover:text-red-300 hover:bg-slate-800"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="text-[11px] text-slate-500">
          Baseline: Active rules check {bundle.location.name} at {formatTime12h(checkTime)} and also run against{' '}
          {formatTempWithUnit(15, unit)} / {formatWind(40, unit)} thresholds while Habari Weather is open.
        </div>
      </div>
    </section>
  );
}

function formatTime12h(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}
