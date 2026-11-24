import type { User } from 'firebase/auth';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BellRing,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Compass,
  MapPin,
  Navigation,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Sunrise,
  Sunset,
  Thermometer,
  X,
} from 'lucide-react';
import { ActivityPredictions } from './components/ActivityPredictions';
import { CommuteAndGroundTruthMap } from './components/CommuteAndGroundTruthMap';
import { CurrentWeatherHero } from './components/CurrentWeatherHero';
import { ForecastAndAlerts } from './components/ForecastAndAlerts';
import { LocationSearch } from './components/LocationSearch';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallButton } from './components/PWAInstallButton';
import { WeatherIcon } from './components/WeatherIcon';
import { CameraPreset, WeatherScene3D } from './components/WeatherScene3D';
import { subscribeToAuthState } from './firebase';
import { fetchAiDailySummary } from './services/dailySummaryApi';
import {
  deleteThresholdRuleFirestore,
  evaluateThresholdRule,
  loadLocalThresholdRules,
  saveLocalThresholdRules,
  saveThresholdRuleFirestore,
  subscribeToUserThresholdRules,
  ThresholdAlertRule,
  toggleThresholdRuleFirestore,
} from './services/thresholdAlertsService';
import {
  DEFAULT_CITIES,
  deriveMeteorologicalAlerts,
  describeWeatherCode,
  fetchWeatherForCity,
  formatTempWithUnit,
  formatWind,
} from './services/weatherApi';
import {
  AlertPreferences,
  CityLocation,
  TemperatureUnit,
  WeatherBundle,
} from './types/weather';
import {
  estimateCloudCoverFromWmo,
  predictActivities,
  predictDailyActivities,
} from './utils/activityPredictor';
import {
  BrowserPermissionState,
  dispatchPushNotification,
  getNotificationSupportAndPermission,
  requestBrowserNotificationPermission,
  shouldNotifyForAlert,
} from './utils/notifications';
import { calculateSolarTimes } from './utils/solarTimes';

const STORAGE_KEYS = {
  unit: 'stratus_unit_v1',
  savedCities: 'stratus_saved_cities_v1',
  activeCity: 'stratus_active_city_v1',
  alertPrefs: 'stratus_alert_prefs_v1',
};

const DEFAULT_ALERT_PREFS: AlertPreferences = {
  enabled: false,
  notifyStorms: true,
  notifyHighWind: true,
  notifyExtremeTemp: true,
  notifyHeavyPrecip: true,
};

type DrawerTab = 'none' | 'telemetry' | 'activities' | 'forecast' | 'commute';

interface ToastNotification {
  id: string;
  title: string;
  message: string;
  tone: 'severe' | 'info';
}

function loadStoredJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [unit, setUnit] = useState<TemperatureUnit>(() => {
    const stored = loadStoredJson<string>(STORAGE_KEYS.unit, 'F');
    return stored === 'C' || stored === 'F' ? stored : 'F';
  });

  const [savedCities, setSavedCities] = useState<CityLocation[]>(() => {
    const stored = loadStoredJson<CityLocation[]>(STORAGE_KEYS.savedCities, DEFAULT_CITIES);
    return Array.isArray(stored) && stored.length > 0 ? stored : DEFAULT_CITIES;
  });

  const [activeCity, setActiveCity] = useState<CityLocation>(() => {
    const stored = loadStoredJson<CityLocation | null>(STORAGE_KEYS.activeCity, null);
    return stored && stored.name ? stored : DEFAULT_CITIES[0];
  });

  const [alertPrefs, setAlertPrefs] = useState<AlertPreferences>(() =>
    loadStoredJson<AlertPreferences>(STORAGE_KEYS.alertPrefs, DEFAULT_ALERT_PREFS)
  );

  const [permissionState, setPermissionState] = useState<BrowserPermissionState>(() =>
    getNotificationSupportAndPermission()
  );

  const [bundle, setBundle] = useState<WeatherBundle | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastNotification | null>(null);

  const [activeDrawer, setActiveDrawer] = useState<DrawerTab>(() => {
    try {
      const tab = new URLSearchParams(window.location.search).get('tab');
      if (tab === 'telemetry' || tab === 'activities' || tab === 'forecast' || tab === 'commute') {
        return tab;
      }
    } catch {
      // Ignore query parse issues
    }
    return 'none';
  });
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('station');
  const [presetNonce, setPresetNonce] = useState<number>(0);
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);
  const [solarPhase, setSolarPhase] = useState<'live' | 'sunrise' | 'sunset'>('live');

  const [authUser, setAuthUser] = useState<User | null>(null);
  const [thresholdRules, setThresholdRules] = useState<ThresholdAlertRule[]>(() =>
    loadLocalThresholdRules()
  );
  const [dailySummary, setDailySummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState<boolean>(false);
  const [summaryDismissed, setSummaryDismissed] = useState<boolean>(false);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const notifiedKeysRef = useRef<Set<string>>(new Set());
  const summaryCacheRef = useRef<Record<string, string>>({});
  const triggeredRuleDatesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    return subscribeToAuthState((user) => {
      setAuthUser(user);
    });
  }, []);

  useEffect(() => {
    if (!authUser) {
      setThresholdRules(loadLocalThresholdRules());
      return;
    }
    const unsub = subscribeToUserThresholdRules(
      authUser.uid,
      (rules) => setThresholdRules(rules),
      () => {
        // Ignore transient permission sync error
      }
    );
    return () => unsub();
  }, [authUser]);

  // Persist user preferences
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.unit, JSON.stringify(unit));
    } catch {
      // Ignore storage errors
    }
  }, [unit]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.savedCities, JSON.stringify(savedCities));
    } catch {
      // Ignore storage errors
    }
  }, [savedCities]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.activeCity, JSON.stringify(activeCity));
    } catch {
      // Ignore storage errors
    }
  }, [activeCity]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.alertPrefs, JSON.stringify(alertPrefs));
    } catch {
      // Ignore storage errors
    }
  }, [alertPrefs]);

  // Keyboard shortcut 'H' to toggle Zen / Hide Controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const showToast = useCallback((title: string, message: string, tone: 'severe' | 'info') => {
    const id = `${Date.now()}`;
    setToast({ id, title, message, tone });
    window.setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev));
    }, 7000);
  }, []);

  const loadWeather = useCallback(
    async (city: CityLocation, isManualRefresh = false) => {
      if (isManualRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const result = await fetchWeatherForCity(city, unit);
        setBundle(result);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unable to retrieve local weather right now.';
        setError(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [unit]
  );

  useEffect(() => {
    loadWeather(activeCity, false);
  }, [activeCity]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSelectedDayIndex(0);
    setSolarPhase('live');
  }, [activeCity.id]);

  const displayBundle = useMemo<WeatherBundle | null>(() => {
    if (!bundle) return null;
    const nwsOnly = bundle.alerts.filter((a) => a.source === 'NWS');
    const metAlerts = deriveMeteorologicalAlerts(bundle.current, bundle.hourly, unit);
    return {
      ...bundle,
      alerts: [...nwsOnly, ...metAlerts],
    };
  }, [bundle, unit]);

  const previewDay = useMemo(() => {
    if (!displayBundle || selectedDayIndex <= 0) return null;
    return displayBundle.daily[selectedDayIndex] ?? null;
  }, [displayBundle, selectedDayIndex]);

  const previewDayLabel = useMemo(() => {
    if (!previewDay) return '';
    if (selectedDayIndex === 1) return 'Tomorrow';
    const [y, m, d] = previewDay.dateIso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(dt);
  }, [previewDay, selectedDayIndex]);

  const topActivities = useMemo(() => {
    if (!displayBundle) return [];
    if (previewDay) {
      return predictDailyActivities(previewDay, unit);
    }
    return predictActivities(displayBundle.current, displayBundle.hourly, unit);
  }, [displayBundle, previewDay, unit]);

  const idealActivities = topActivities.filter((a) => a.suitability === 'Ideal');

  // Dispatch push notifications for active severe alerts
  useEffect(() => {
    if (!displayBundle || !alertPrefs.enabled) return;

    for (const alert of displayBundle.alerts) {
      if (!shouldNotifyForAlert(alert, alertPrefs)) continue;
      const dedupeKey = `${displayBundle.location.id}:${alert.id}`;
      if (notifiedKeysRef.current.has(dedupeKey)) continue;

      notifiedKeysRef.current.add(dedupeKey);
      const title = `${alert.title} — ${displayBundle.location.name}`;
      dispatchPushNotification(title, alert.headline, dedupeKey);
      showToast(title, alert.headline, 'severe');
    }
  }, [displayBundle, alertPrefs, showToast]);

  // Fetch prominent 2-sentence plain-English AI daily summary right at the top
  useEffect(() => {
    if (!displayBundle) return;
    const cacheKey = `${displayBundle.location.id}:${unit}:${displayBundle.current.observationTimeIso}`;
    const cached = summaryCacheRef.current[cacheKey];
    if (cached) {
      setDailySummary(cached);
      setSummaryLoading(false);
      return;
    }

    let canceled = false;
    setSummaryLoading(true);
    fetchAiDailySummary({
      cityName: displayBundle.location.name,
      unit,
      current: displayBundle.current,
      hourly: displayBundle.hourly.slice(0, 18),
    })
      .then((text) => {
        if (canceled) return;
        if (text) {
          summaryCacheRef.current[cacheKey] = text;
          setDailySummary(text);
        }
      })
      .catch(() => {
        // Keep UI graceful if AI summary endpoint fails momentarily
      })
      .finally(() => {
        if (!canceled) setSummaryLoading(false);
      });

    return () => {
      canceled = true;
    };
  }, [displayBundle, unit]);

  // Evaluate scheduled custom threshold alert rules every 30 seconds while open
  useEffect(() => {
    if (!displayBundle || thresholdRules.length === 0) return;

    const checkScheduledRules = () => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const dayKey = now.toISOString().slice(0, 10);

      for (const rule of thresholdRules) {
        if (!rule.enabled || rule.checkTime !== hhmm) continue;
        const firedKey = `${rule.id}:${dayKey}`;
        if (triggeredRuleDatesRef.current.has(firedKey)) continue;

        const evalRes = evaluateThresholdRule(rule, displayBundle, unit);
        triggeredRuleDatesRef.current.add(firedKey);
        if (evalRes.triggered) {
          const title = `${evalRes.headline} — ${displayBundle.location.name}`;
          dispatchPushNotification(title, evalRes.detail, firedKey);
          showToast(title, evalRes.detail, 'info');
        }
      }
    };

    checkScheduledRules();
    const timer = window.setInterval(checkScheduledRules, 30000);
    return () => window.clearInterval(timer);
  }, [displayBundle, thresholdRules, unit, showToast]);

  const handleSelectCity = (city: CityLocation) => {
    setActiveCity(city);
    setSavedCities((prev) => {
      const exists = prev.some(
        (c) =>
          c.id === city.id ||
          (Math.abs(c.latitude - city.latitude) < 0.02 &&
            Math.abs(c.longitude - city.longitude) < 0.02)
      );
      if (exists) return prev;
      return [city, ...prev].slice(0, 6);
    });
  };

  const handleRemoveSavedCity = (cityId: string) => {
    setSavedCities((prev) => {
      const next = prev.filter((c) => c.id !== cityId);
      if (next.length === 0) return prev;
      if (activeCity.id === cityId) {
        setActiveCity(next[0]);
      }
      return next;
    });
  };

  const handleEnablePushAlerts = async () => {
    if (alertPrefs.enabled) {
      setAlertPrefs((prev) => ({ ...prev, enabled: false }));
      showToast('Push Alerts Paused', 'Severe weather push notifications are paused.', 'info');
      return;
    }

    const perm = await requestBrowserNotificationPermission();
    setPermissionState(perm);
    setAlertPrefs((prev) => ({ ...prev, enabled: true }));

    if (perm === 'granted') {
      const cityName = displayBundle?.location.name || activeCity.name;
      dispatchPushNotification(
        `Severe Alerts Enabled — ${cityName}`,
        'You will be notified immediately if severe weather develops.',
        'habari-opt-in'
      );
      showToast(
        'Push Alerts Active',
        `Monitoring ${cityName} for storms, high winds, extreme temperatures, and heavy precipitation.`,
        'info'
      );
    } else {
      showToast(
        'In-App Severe Alerts Active',
        'Browser desktop popups are unavailable or blocked here; severe alerts appear directly in the app.',
        'info'
      );
    }
  };

  const handleTogglePref = (key: keyof AlertPreferences) => {
    setAlertPrefs((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSendTestNotification = async () => {
    let currentPerm = getNotificationSupportAndPermission();
    if (currentPerm === 'default') {
      currentPerm = await requestBrowserNotificationPermission();
      setPermissionState(currentPerm);
    }

    const cityName = displayBundle?.location.name || activeCity.name;
    const title = `Severe Thunderstorm Watch — ${cityName}`;
    const body =
      unit === 'F'
        ? 'Sample alert: Gusts up to 55 mph and heavy rain moving across the metro area.'
        : 'Sample alert: Gusts up to 88 km/h and heavy rain moving across the metro area.';

    const res = dispatchPushNotification(title, body, 'habari-test-alert');
    showToast(
      title,
      res.deliveredNative ? `${body} (Sent to system notifications)` : body,
      'severe'
    );
  };

  const handleAddThresholdRule = async (ruleInput: Omit<ThresholdAlertRule, 'id'>) => {
    if (authUser) {
      await saveThresholdRuleFirestore(ruleInput);
    } else {
      const saved = await saveThresholdRuleFirestore(ruleInput);
      setThresholdRules((prev) => {
        const next = [saved, ...prev];
        saveLocalThresholdRules(next);
        return next;
      });
    }
    showToast('Threshold Rule Saved', ruleInput.title, 'info');
  };

  const handleToggleThresholdRule = async (rule: ThresholdAlertRule) => {
    if (authUser) {
      await toggleThresholdRuleFirestore(rule);
    } else {
      setThresholdRules((prev) => {
        const next = prev.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
        saveLocalThresholdRules(next);
        return next;
      });
    }
  };

  const handleDeleteThresholdRule = async (ruleId: string) => {
    if (authUser) {
      await deleteThresholdRuleFirestore(ruleId);
    } else {
      setThresholdRules((prev) => {
        const next = prev.filter((r) => r.id !== ruleId);
        saveLocalThresholdRules(next);
        return next;
      });
    }
  };

  const handleTestThresholdRule = async (rule: ThresholdAlertRule) => {
    if (!displayBundle) return;
    let currentPerm = getNotificationSupportAndPermission();
    if (currentPerm === 'default') {
      currentPerm = await requestBrowserNotificationPermission();
      setPermissionState(currentPerm);
    }
    const evalRes = evaluateThresholdRule(rule, displayBundle, unit);
    const title = `${evalRes.headline} — ${displayBundle.location.name}`;
    dispatchPushNotification(title, evalRes.detail, `rule-preview-${rule.id}`);
    showToast(title, evalRes.detail, evalRes.triggered ? 'severe' : 'info');
  };

  const toggleDrawer = (tab: DrawerTab) => {
    setActiveDrawer((prev) => (prev === tab ? 'none' : tab));
    setDockCollapsed(false);
  };

  const selectCameraPreset = (preset: CameraPreset) => {
    setCameraPreset(preset);
    setPresetNonce((n) => n + 1);
  };

  const hasSevereAlert = Boolean(displayBundle && displayBundle.alerts.length > 0);

  const solarSummary = useMemo(() => {
    if (!displayBundle) return null;
    if (previewDay?.sunriseIso && previewDay?.sunsetIso) {
      const formatIso12h = (iso: string) => {
        const parts = iso.split('T')[1]?.split(':');
        if (!parts || parts.length < 2) return '—';
        const h24 = Number(parts[0]);
        const mins = Number(parts[1]);
        if (Number.isNaN(h24) || Number.isNaN(mins)) return '—';
        const period = h24 >= 12 ? 'PM' : 'AM';
        const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
        return `${h12}:${String(mins).padStart(2, '0')} ${period}`;
      };
      return {
        sunriseLabel: formatIso12h(previewDay.sunriseIso),
        sunsetLabel: formatIso12h(previewDay.sunsetIso),
      };
    }
    const calc = calculateSolarTimes(
      displayBundle.location.latitude,
      displayBundle.location.longitude,
      displayBundle.timezone,
      displayBundle.utcOffsetSeconds
    );
    return {
      sunriseLabel: calc.sunriseLabel,
      sunsetLabel: calc.sunsetLabel,
    };
  }, [displayBundle, previewDay]);

  const stationScene = useMemo(() => {
    const baseSunrise = previewDay?.sunriseIso ?? displayBundle?.daily[0]?.sunriseIso;
    const baseSunset = previewDay?.sunsetIso ?? displayBundle?.daily[0]?.sunsetIso;

    if (previewDay) {
      const code = previewDay.weatherCode;
      const isFoggy = code === 45 || code === 48;
      const isWet = code >= 51 && code <= 99;
      const obsTime =
        solarPhase === 'sunrise'
          ? baseSunrise || `${previewDay.dateIso}T06:45`
          : solarPhase === 'sunset'
            ? baseSunset || `${previewDay.dateIso}T17:30`
            : `${previewDay.dateIso}T13:30`;
      return {
        weatherCode: code,
        isDay: true,
        windSpeedKmh: previewDay.windSpeedMaxKmh,
        windDirectionDeg: displayBundle?.current.windDirectionDeg ?? 210,
        cloudCover: estimateCloudCoverFromWmo(code),
        precipitationMm: isWet
          ? Math.max(previewDay.precipitationSumMm * 0.35, 0.9)
          : previewDay.precipitationSumMm * 0.2,
        visibilityKm: isFoggy ? 1.5 : code >= 63 ? 5.5 : 16,
        humidity: isWet || isFoggy ? 88 : 52,
        observationTimeIso: obsTime,
        sunriseIso: baseSunrise,
        sunsetIso: baseSunset,
        hasSevereAlert: code >= 95 || previewDay.windGustsMaxKmh >= 60,
      };
    }

    const liveObs =
      solarPhase === 'sunrise'
        ? baseSunrise || '2026-11-21T06:45'
        : solarPhase === 'sunset'
          ? baseSunset || '2026-11-21T17:30'
          : displayBundle?.current.observationTimeIso;

    return {
      weatherCode: displayBundle?.current.weatherCode ?? 0,
      isDay: solarPhase !== 'live' ? true : displayBundle?.current.isDay ?? true,
      windSpeedKmh: displayBundle?.current.windSpeedKmh ?? 12,
      windDirectionDeg: displayBundle?.current.windDirectionDeg ?? 210,
      cloudCover: displayBundle?.current.cloudCover ?? 25,
      precipitationMm: displayBundle?.current.precipitationMm ?? 0,
      visibilityKm: displayBundle?.current.visibilityKm ?? 12,
      humidity: displayBundle?.current.humidity ?? 55,
      observationTimeIso: liveObs,
      sunriseIso: baseSunrise,
      sunsetIso: baseSunset,
      hasSevereAlert,
    };
  }, [displayBundle, hasSevereAlert, previewDay, solarPhase]);

  return (
    <div className="relative w-screen h-[100dvh] overflow-hidden select-none sm:select-auto">
      {/* Full-Bleed Live 3D Weather Observatory */}
      <WeatherScene3D
        weatherCode={stationScene.weatherCode}
        isDay={stationScene.isDay}
        windSpeedKmh={stationScene.windSpeedKmh}
        windDirectionDeg={stationScene.windDirectionDeg}
        cloudCover={stationScene.cloudCover}
        precipitationMm={stationScene.precipitationMm}
        visibilityKm={stationScene.visibilityKm}
        humidity={stationScene.humidity}
        observationTimeIso={stationScene.observationTimeIso}
        sunriseIso={stationScene.sunriseIso}
        sunsetIso={stationScene.sunsetIso}
        hasSevereAlert={stationScene.hasSevereAlert}
        cameraPreset={cameraPreset}
        presetNonce={presetNonce}
      />

      <OfflineIndicator />

      {/* Top Slim HUD Bar (Solid rgba surface, zero backdrop-filter over WebGL) */}
      <header className="fixed safe-top-offset left-1/2 -translate-x-1/2 z-30 w-[min(1160px,95vw)] pointer-events-auto">
        <div className="bg-[rgba(15,23,42,0.92)] border border-slate-700/80 rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 shadow-xl flex flex-wrap md:flex-nowrap items-center justify-between gap-2.5 sm:gap-3">
          {/* Zone 1: Brand & Live City Weather Readout */}
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-display text-sm sm:text-base font-semibold tracking-tight text-white whitespace-nowrap shrink-0">
              Habari Weather
            </span>
            <span className="text-slate-600 hidden sm:inline" aria-hidden="true">
              /
            </span>
            {displayBundle ? (
              <button
                type="button"
                onClick={() => toggleDrawer('telemetry')}
                className="inline-flex items-center gap-2 text-left hover:bg-slate-800/80 rounded-lg px-2 py-1 transition-colors min-w-0"
              >
                <WeatherIcon
                  code={displayBundle.current.weatherCode}
                  isDay={displayBundle.current.isDay}
                  className="w-5 h-5 shrink-0"
                />
                <span className="text-sm font-semibold text-white truncate">
                  {displayBundle.location.name}
                </span>
                <span className="text-sm font-semibold font-mono-tabular text-sky-300 whitespace-nowrap shrink-0">
                  {formatTempWithUnit(displayBundle.current.temperatureC, unit)}
                </span>
                <span className="text-xs text-slate-300 hidden lg:inline whitespace-nowrap shrink-0">
                  {describeWeatherCode(displayBundle.current.weatherCode)}
                </span>
              </button>
            ) : (
              <span className="text-xs text-slate-400">
                {loading ? `Loading ${activeCity.name}...` : activeCity.name}
              </span>
            )}
          </div>

          {/* Zone 2: Inline City Search & Location Changer */}
          <div className="w-full md:w-[340px] lg:w-[390px] order-3 md:order-2">
            <LocationSearch
              currentCity={activeCity}
              savedCities={savedCities}
              onSelectCity={handleSelectCity}
              onRemoveSavedCity={handleRemoveSavedCity}
              inputRef={searchInputRef}
              compact
            />
          </div>

          {/* Zone 3: Alert Indicator, Install App + °F / °C Unit Toggle */}
          <div className="flex items-center gap-2 order-2 md:order-3 shrink-0">
            <PWAInstallButton />

            {hasSevereAlert && displayBundle && (
              <button
                type="button"
                onClick={() => toggleDrawer('forecast')}
                className="px-2.5 py-1.5 rounded-lg bg-red-950 border border-red-700 text-red-200 hover:bg-red-900 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" aria-hidden="true" />
                <span>{displayBundle.alerts.length} Alert</span>
              </button>
            )}

            <div
              role="group"
              aria-label="Temperature unit"
              className="inline-flex items-center p-0.5 bg-slate-950 border border-slate-700 rounded-lg"
            >
              <button
                type="button"
                aria-pressed={unit === 'F'}
                onClick={() => setUnit('F')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  unit === 'F' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                °F
              </button>
              <button
                type="button"
                aria-pressed={unit === 'C'}
                onClick={() => setUnit('C')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  unit === 'C' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                °C
              </button>
            </div>
          </div>
        </div>

        {/* Saved Cities Strip + Sunrise & Sunset Solar Readout directly beneath Top Bar */}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-0.5">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 max-w-full">
            {savedCities.map((city) => {
              const isActive =
                city.id === activeCity.id ||
                (Math.abs(city.latitude - activeCity.latitude) < 0.02 &&
                  Math.abs(city.longitude - activeCity.longitude) < 0.02);
              return (
                <div
                  key={city.id}
                  className={`inline-flex items-center rounded-md border text-xs transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-sky-600 border-sky-500 text-white shadow-sm'
                      : 'bg-[rgba(15,23,42,0.84)] border-slate-700/80 text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectCity(city)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 font-medium whitespace-nowrap shrink-0"
                  >
                    <MapPin className="w-3 h-3 opacity-80" aria-hidden="true" />
                    <span>{city.name}</span>
                  </button>
                  {savedCities.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSavedCity(city.id)}
                      aria-label={`Remove ${city.name}`}
                      className={`pr-2 pl-0.5 py-1 opacity-75 hover:opacity-100 ${
                        isActive ? 'text-sky-100 hover:text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {solarSummary && (
            <div
              role="group"
              aria-label="Sunrise and sunset horizon preview"
              className="inline-flex items-center gap-1 p-0.5 bg-[rgba(15,23,42,0.88)] border border-slate-700/80 rounded-lg shrink-0"
            >
              <button
                type="button"
                aria-pressed={solarPhase === 'sunrise'}
                onClick={() => setSolarPhase((prev) => (prev === 'sunrise' ? 'live' : 'sunrise'))}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  solarPhase === 'sunrise'
                    ? 'bg-amber-500/20 text-amber-200 border border-amber-400/50'
                    : 'text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Sunrise className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
                <span className="text-slate-400">Sunrise</span>
                <span className="font-mono-tabular font-semibold text-white">
                  {solarSummary.sunriseLabel}
                </span>
              </button>

              <span className="text-slate-700" aria-hidden="true">
                ·
              </span>

              <button
                type="button"
                aria-pressed={solarPhase === 'sunset'}
                onClick={() => setSolarPhase((prev) => (prev === 'sunset' ? 'live' : 'sunset'))}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                  solarPhase === 'sunset'
                    ? 'bg-orange-500/20 text-orange-200 border border-orange-400/50'
                    : 'text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Sunset className="w-3.5 h-3.5 text-orange-400 shrink-0" aria-hidden="true" />
                <span className="text-slate-400">Sunset</span>
                <span className="font-mono-tabular font-semibold text-white">
                  {solarSummary.sunsetLabel}
                </span>
              </button>

              {solarPhase !== 'live' && (
                <button
                  type="button"
                  onClick={() => setSolarPhase('live')}
                  className="px-2 py-1 rounded-md text-[11px] font-semibold text-sky-300 hover:text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                >
                  Live
                </button>
              )}
            </div>
          )}

          {summaryDismissed && dailySummary && (
            <button
              type="button"
              onClick={() => setSummaryDismissed(false)}
              className="px-2.5 py-1 rounded-lg bg-[rgba(15,23,42,0.88)] border border-slate-700/80 text-[11px] font-medium text-sky-300 hover:text-white inline-flex items-center gap-1.5 shrink-0"
            >
              <Sparkles className="w-3 h-3" aria-hidden="true" />
              <span>Daily Summary</span>
            </button>
          )}
        </div>

        {/* 2-Sentence Plain-English AI Daily Summary Banner */}
        {displayBundle && !summaryDismissed && (dailySummary || summaryLoading) && (
          <div className="mt-2 bg-[rgba(15,23,42,0.90)] border border-slate-700/80 rounded-xl px-3.5 py-2 shadow-lg flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0">
              {summaryLoading && !dailySummary ? (
                <RefreshCw
                  className="w-3.5 h-3.5 text-sky-400 animate-spin shrink-0 mt-0.5"
                  aria-hidden="true"
                />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" aria-hidden="true" />
              )}
              <p className="text-xs sm:text-[13px] text-slate-100 leading-snug">
                {dailySummary || `Writing your plain-English daily outlook for ${displayBundle.location.name}...`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSummaryDismissed(true)}
              aria-label="Hide daily summary"
              className="p-0.5 text-slate-400 hover:text-white rounded shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </header>

      {/* Error State Overlay if initial load fails */}
      {error && !displayBundle && (
        <div className="fixed inset-0 z-20 flex items-center justify-center p-4 pointer-events-none">
          <div className="bg-[rgba(15,23,42,0.95)] border border-slate-700 rounded-xl p-6 max-w-sm text-center space-y-3 pointer-events-auto shadow-2xl">
            <p className="text-sm font-semibold text-white">Unable to load weather data</p>
            <p className="text-xs text-slate-300">{error}</p>
            <button
              type="button"
              onClick={() => loadWeather(activeCity, false)}
              className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors"
            >
              Retry Forecast
            </button>
          </div>
        </div>
      )}

      {/* Collapsible Bottom Control Dock (Zero Mid-Screen Occlusion) */}
      <div
        className={`fixed safe-bottom-offset left-1/2 -translate-x-1/2 z-30 flex flex-col items-center pointer-events-none ${
          activeDrawer === 'commute' ? 'w-[min(1120px,96vw)]' : 'w-[min(1020px,95vw)]'
        }`}
      >
        {/* Collapse / Expand Toggle Handle */}
        <button
          type="button"
          onClick={() => setDockCollapsed((prev) => !prev)}
          className="pointer-events-auto mb-1.5 px-3.5 py-1 rounded-t-lg bg-[rgba(15,23,42,0.92)] border border-b-0 border-slate-700/80 text-[11px] font-medium text-slate-200 hover:text-white inline-flex items-center gap-1.5 transition-colors shadow-lg"
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
              <span>Show Controls (H)</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
              <span>Hide Controls (H)</span>
            </>
          )}
        </button>

        {/* Main Dock + Expandable Drawer */}
        <div
          className={`w-full transition-all duration-200 ease-out origin-bottom ${
            dockCollapsed
              ? 'opacity-0 translate-y-8 pointer-events-none h-0 overflow-hidden'
              : 'opacity-100 translate-y-0 pointer-events-auto'
          }`}
        >
          {/* Expandable Feature Drawer */}
          {activeDrawer !== 'none' && displayBundle && (
            <div className="mb-2 bg-[rgba(15,23,42,0.95)] border border-slate-700/90 rounded-xl shadow-2xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-300 truncate pr-2">
                  {activeDrawer === 'telemetry' && `${displayBundle.location.name} · Current Telemetry & Hourly Outlook`}
                  {activeDrawer === 'activities' && `${displayBundle.location.name} · Outside Activities & Smart Lifestyle Guide`}
                  {activeDrawer === 'forecast' && `${displayBundle.location.name} · 7-Day Outlook, Model Confidence & Custom Alerts`}
                  {activeDrawer === 'commute' && `${displayBundle.location.name} · Commute Radar, Micro-Route Weather & Ground Truth`}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href="/privacy"
                    className="text-[11px] text-slate-400 hover:text-sky-300 transition-colors"
                  >
                    Privacy
                  </a>
                  <button
                    type="button"
                    onClick={() => setActiveDrawer('none')}
                    aria-label="Close panel"
                    className="p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 transition-colors shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div
                className={`p-3.5 sm:p-5 overflow-y-auto ${
                  activeDrawer === 'commute' ? 'max-h-[68dvh]' : 'max-h-[54dvh]'
                }`}
              >
                {activeDrawer === 'telemetry' && (
                  <CurrentWeatherHero
                    bundle={displayBundle}
                    unit={unit}
                    onRefresh={() => loadWeather(activeCity, true)}
                    isRefreshing={refreshing}
                  />
                )}
                {activeDrawer === 'activities' && (
                  <ActivityPredictions
                    bundle={displayBundle}
                    unit={unit}
                    selectedDay={previewDay}
                    selectedDayLabel={previewDayLabel}
                    onResetToLive={() => setSelectedDayIndex(0)}
                  />
                )}
                {activeDrawer === 'forecast' && (
                  <ForecastAndAlerts
                    bundle={displayBundle}
                    unit={unit}
                    selectedDayIndex={selectedDayIndex}
                    onSelectDay={setSelectedDayIndex}
                    alertPrefs={alertPrefs}
                    permissionState={permissionState}
                    onEnablePushAlerts={handleEnablePushAlerts}
                    onTogglePref={handleTogglePref}
                    onSendTestNotification={handleSendTestNotification}
                    authUser={authUser}
                    thresholdRules={thresholdRules}
                    onAddThresholdRule={handleAddThresholdRule}
                    onToggleThresholdRule={handleToggleThresholdRule}
                    onDeleteThresholdRule={handleDeleteThresholdRule}
                    onTestThresholdRule={handleTestThresholdRule}
                  />
                )}
                {activeDrawer === 'commute' && (
                  <CommuteAndGroundTruthMap activeCity={activeCity} unit={unit} />
                )}
              </div>
            </div>
          )}

          {/* Compact Bottom Dock Strip (<= 15% viewport height) */}
          <div className="bg-[rgba(15,23,42,0.92)] border border-slate-700/90 rounded-xl px-3.5 py-2.5 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Live Local or Selected Forecast Day Summary Readout */}
            <div className="flex items-center gap-3 min-w-0 overflow-x-auto">
              {displayBundle ? (
                previewDay ? (
                  <div className="flex items-center gap-2.5 text-xs text-slate-200 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setSelectedDayIndex(0)}
                      className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200 font-semibold transition-colors whitespace-nowrap shrink-0"
                    >
                      <RotateCcw className="w-3 h-3" aria-hidden="true" />
                      <span>{previewDayLabel} · Live</span>
                    </button>
                    <span className="text-slate-600" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-mono-tabular">
                      {formatTempWithUnit(previewDay.tempMaxC, unit)} /{' '}
                      {formatTempWithUnit(previewDay.tempMinC, unit)}
                    </span>
                    <span className="text-slate-600" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-mono-tabular text-sky-300">
                      Rain {previewDay.precipitationProbabilityMax}%
                    </span>
                    <span className="text-slate-600 hidden sm:inline" aria-hidden="true">
                      ·
                    </span>
                    <span className="hidden sm:inline text-emerald-300 font-medium">
                      {idealActivities.length > 0
                        ? `Ideal: ${idealActivities[0].name}`
                        : 'Indoor conditions favored'}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-xs text-slate-200 whitespace-nowrap">
                    <span className="font-mono-tabular">
                      Feels {formatTempWithUnit(displayBundle.current.apparentTemperatureC, unit)}
                    </span>
                    <span className="text-slate-600" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-mono-tabular">
                      Wind {formatWind(displayBundle.current.windSpeedKmh, unit)}
                    </span>
                    <span className="text-slate-600" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-mono-tabular text-sky-300">
                      Rain {displayBundle.current.precipitationProbability}%
                    </span>
                    <span className="text-slate-600" aria-hidden="true">
                      ·
                    </span>
                    <span
                      className={`font-mono-tabular ${
                        displayBundle.current.uvIndex >= 6 ? 'text-amber-300' : 'text-slate-200'
                      }`}
                    >
                      UV {displayBundle.current.uvIndex.toFixed(1)}
                    </span>
                    <span className="text-slate-600 hidden sm:inline" aria-hidden="true">
                      ·
                    </span>
                    <span className="hidden sm:inline text-emerald-300 font-medium">
                      {idealActivities.length > 0
                        ? `Ideal: ${idealActivities[0].name}`
                        : 'Indoor conditions favored'}
                    </span>
                  </div>
                )
              ) : (
                <span className="text-xs text-slate-400">Syncing live meteorological feed...</span>
              )}
            </div>

            {/* Dock Navigation Tabs & 3D Camera Presets */}
            <div className="flex flex-wrap items-center justify-between md:justify-end gap-2 shrink-0 w-full md:w-auto">
              <div className="grid grid-cols-4 sm:inline-flex items-center gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-lg w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => toggleDrawer('telemetry')}
                  className={`min-h-[38px] px-2 sm:px-3 py-1.5 rounded-md text-[11px] sm:text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                    activeDrawer === 'telemetry'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Thermometer className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Telemetry</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleDrawer('activities')}
                  className={`min-h-[38px] px-2 sm:px-3 py-1.5 rounded-md text-[11px] sm:text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                    activeDrawer === 'activities'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Activities</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleDrawer('forecast')}
                  className={`min-h-[38px] px-2 sm:px-3 py-1.5 rounded-md text-[11px] sm:text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                    activeDrawer === 'forecast'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <CalendarDays className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span className="sm:hidden">7-Day</span>
                  <span className="hidden sm:inline">7-Day &amp; Alerts</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleDrawer('commute')}
                  className={`min-h-[38px] px-2 sm:px-3 py-1.5 rounded-md text-[11px] sm:text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                    activeDrawer === 'commute'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Navigation className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span className="sm:hidden">Commute</span>
                  <span className="hidden sm:inline">Commute &amp; Map</span>
                </button>
              </div>

              {/* 3D Camera Presets */}
              <div
                role="group"
                aria-label="3D Camera View"
                className="hidden sm:inline-flex items-center gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-lg"
              >
                <Compass className="w-3.5 h-3.5 text-slate-400 ml-1.5 mr-0.5" aria-hidden="true" />
                {(['station', 'horizon', 'sky'] as CameraPreset[]).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => selectCameraPreset(preset)}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium capitalize transition-colors whitespace-nowrap shrink-0 ${
                      cameraPreset === preset
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* In-App Push Alert Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed top-24 right-5 z-50 max-w-sm w-[calc(100%-2.5rem)] rounded-xl shadow-2xl border p-4 flex items-start gap-3 ${
            toast.tone === 'severe'
              ? 'bg-[rgba(69,10,10,0.96)] border-red-600 text-red-50'
              : 'bg-[rgba(15,23,42,0.96)] border-slate-700 text-slate-100'
          }`}
        >
          <BellRing
            className={`w-5 h-5 shrink-0 mt-0.5 ${
              toast.tone === 'severe' ? 'text-red-400' : 'text-sky-400'
            }`}
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">{toast.title}</div>
            <p className="text-xs opacity-90 mt-1 leading-relaxed">{toast.message}</p>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss alert"
            className="opacity-70 hover:opacity-100 p-1 rounded shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
