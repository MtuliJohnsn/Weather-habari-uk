import type { User } from 'firebase/auth';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  AlertTriangle,
  ArrowLeftRight,
  Bike,
  Car,
  CheckCircle2,
  CloudRain,
  Compass,
  Crosshair,
  Droplets,
  Layers,
  MapPin,
  Navigation,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Snowflake,
  ThumbsUp,
  UserCheck,
  Wind,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { signInWithGooglePopup, signOutFirebase, subscribeToAuthState } from '../firebase';
import {
  checkUserVerifiedReport,
  createGroundTruthReport,
  GROUND_TRUTH_TAGS,
  GroundTruthReport,
  GroundTruthTagType,
  resolveGroundTruthReport,
  subscribeToActiveGroundTruthReports,
  verifyGroundTruthReport,
} from '../services/groundTruthService';
import {
  analyzeRouteMicroWeather,
  CommuteVehicleMode,
  CommuteWeatherAnalysis,
  fetchFreeCommuteRoute,
  fetchRainViewerRadar,
  haversineKm,
  LatLngPoint,
  PlaceSearchResult,
  RainViewerMetadata,
  RouteWaypointWeather,
  searchFreePlaces,
} from '../services/routeWeatherApi';
import { formatTempWithUnit, formatWind } from '../services/weatherApi';
import { CityLocation, TemperatureUnit } from '../types/weather';

interface PlaceEndpoint {
  label: string;
  lat: number;
  lng: number;
  isDefaultCorridor?: boolean;
}

interface CameraFocusTarget {
  lat: number;
  lng: number;
  zoom?: number;
  nonce: number;
}

interface PlaceSearchInputProps {
  label: string;
  placeholder: string;
  valueLabel: string;
  biasLat: number;
  biasLng: number;
  onSelectPlace: (endpoint: PlaceEndpoint) => void;
  onUseGps?: () => void;
  gpsLoading?: boolean;
}

function formatRelativeAge(createdAtMs: number): string {
  const diffMins = Math.max(0, Math.round((Date.now() - createdAtMs) / 60000));
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const hrs = Math.floor(diffMins / 60);
  return `${hrs}h ago`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function PlaceSearchInput({
  label,
  placeholder,
  valueLabel,
  biasLat,
  biasLng,
  onSelectPlace,
  onUseGps,
  gpsLoading,
}: PlaceSearchInputProps) {
  const [queryText, setQueryText] = useState(valueLabel);
  const [suggestions, setSuggestions] = useState<PlaceSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setQueryText(valueLabel);
    setSuggestions([]);
    setHasSearched(false);
    setSearchError(null);
  }, [valueLabel]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => {
    if (!open) return;
    const trimmed = queryText.trim();
    if (trimmed.length < 2 || trimmed === valueLabel) {
      setSuggestions([]);
      setHasSearched(false);
      setSearchError(null);
      return;
    }

    let canceled = false;
    const timer = window.setTimeout(async () => {
      try {
        setFetching(true);
        setSearchError(null);
        const results = await searchFreePlaces(trimmed, biasLat, biasLng);
        if (canceled) return;
        setSuggestions(results);
        setHasSearched(true);
      } catch {
        if (canceled) return;
        setSearchError('Unable to reach open place directory.');
        setSuggestions([]);
        setHasSearched(true);
      } finally {
        if (!canceled) setFetching(false);
      }
    }, 280);

    return () => {
      canceled = true;
      window.clearTimeout(timer);
    };
  }, [queryText, open, valueLabel, biasLat, biasLng]);

  const handleChoose = useCallback(
    (item: PlaceSearchResult) => {
      setSuggestions([]);
      setHasSearched(false);
      setOpen(false);
      setQueryText(item.label);
      onSelectPlace({
        label: item.label,
        lat: item.lat,
        lng: item.lng,
        isDefaultCorridor: false,
      });
    },
    [onSelectPlace]
  );

  const handleSubmitEnter = async () => {
    if (suggestions.length > 0) {
      handleChoose(suggestions[0]);
      return;
    }
    const trimmed = queryText.trim();
    if (trimmed.length < 2) return;

    try {
      setFetching(true);
      setSearchError(null);
      const results = await searchFreePlaces(trimmed, biasLat, biasLng);
      if (results.length > 0) {
        handleChoose(results[0]);
      } else {
        setSuggestions([]);
        setHasSearched(true);
        setOpen(true);
      }
    } catch {
      setSearchError('Place search failed. Try a nearby street, bridge, or city.');
      setOpen(true);
    } finally {
      setFetching(false);
    }
  };

  const showDropdown =
    open &&
    (suggestions.length > 0 ||
      Boolean(searchError) ||
      (hasSearched && !fetching && queryText.trim().length >= 2 && queryText.trim() !== valueLabel));

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          {label}
        </span>
        {onUseGps && (
          <button
            type="button"
            onClick={onUseGps}
            disabled={gpsLoading}
            className="text-[11px] text-sky-400 hover:text-sky-300 font-medium inline-flex items-center gap-1 disabled:opacity-50"
          >
            <Crosshair className="w-3 h-3" aria-hidden="true" />
            <span>{gpsLoading ? 'Locating...' : 'My GPS'}</span>
          </button>
        )}
      </div>
      <div className="relative">
        <input
          type="text"
          value={queryText}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQueryText(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleSubmitEnter();
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          className="w-full bg-slate-950 border border-slate-700 focus:border-sky-500 rounded-lg pl-3 pr-8 py-1.5 text-xs text-white placeholder:text-slate-500 outline-none"
        />
        {fetching ? (
          <RefreshCw
            className="w-3 h-3 text-sky-400 animate-spin absolute right-2.5 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
        ) : (
          queryText && (
            <button
              type="button"
              onClick={() => {
                setQueryText('');
                setSuggestions([]);
                setHasSearched(false);
                setSearchError(null);
                setOpen(true);
              }}
              aria-label={`Clear ${label}`}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )
        )}
      </div>

      {showDropdown && (
        <ul className="absolute left-0 right-0 mt-1 z-[600] bg-slate-900 border border-slate-700 rounded-lg shadow-2xl max-h-48 overflow-y-auto divide-y divide-slate-800">
          {suggestions.map((s, idx) => (
            <li key={`${s.lat}-${s.lng}-${idx}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleChoose(s)}
                className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 transition-colors"
              >
                <div className="font-medium text-white truncate">{s.label}</div>
                {s.subtitle && (
                  <div className="text-[11px] text-slate-400 truncate">{s.subtitle}</div>
                )}
              </button>
            </li>
          ))}
          {suggestions.length === 0 && searchError && (
            <li className="px-3 py-2 text-[11px] text-amber-300">{searchError}</li>
          )}
          {suggestions.length === 0 && !searchError && hasSearched && (
            <li className="px-3 py-2 text-[11px] text-slate-400">
              No matching places found. Try a street, bridge, or city name.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

interface CommuteAndGroundTruthMapProps {
  activeCity: CityLocation;
  unit: TemperatureUnit;
}

export function CommuteAndGroundTruthMap({
  activeCity,
  unit,
}: CommuteAndGroundTruthMapProps) {
  const [subMode, setSubMode] = useState<'route' | 'ground-truth'>('route');

  // Auth + Firestore Ground Truth State
  const [user, setUser] = useState<User | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [reports, setReports] = useState<GroundTruthReport[]>([]);
  const [gtError, setGtError] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [verifiedIds, setVerifiedIds] = useState<Record<string, boolean>>({});
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  // Drop-a-tag draft state
  const [draftCoords, setDraftCoords] = useState<LatLngPoint>({
    lat: activeCity.latitude,
    lng: activeCity.longitude,
  });
  const [selectedTag, setSelectedTag] = useState<GroundTruthTagType>('street_flooded');
  const [draftRoad, setDraftRoad] = useState('');
  const [draftNote, setDraftNote] = useState('');
  const [submittingTag, setSubmittingTag] = useState(false);

  // Radar State
  const [radarMeta, setRadarMeta] = useState<RainViewerMetadata | null>(null);
  const [radarLoading, setRadarLoading] = useState(true);
  const [radarUnavailable, setRadarUnavailable] = useState(false);
  const [radarEnabled, setRadarEnabled] = useState(true);
  const [radarFrameIndex, setRadarFrameIndex] = useState(0);
  const [radarPlaying, setRadarPlaying] = useState(false);

  // Route State
  const [origin, setOrigin] = useState<PlaceEndpoint | null>({
    label: `${activeCity.name} Center`,
    lat: activeCity.latitude,
    lng: activeCity.longitude,
  });
  const [destination, setDestination] = useState<PlaceEndpoint | null>(() => ({
    label: `${activeCity.name} Corridor`,
    lat: Number((activeCity.latitude + 0.1).toFixed(4)),
    lng: Number((activeCity.longitude + 0.09).toFixed(4)),
    isDefaultCorridor: true,
  }));
  const [vehicleMode, setVehicleMode] = useState<CommuteVehicleMode>('DRIVING');
  const [departureOffsetMins, setDepartureOffsetMins] = useState<number>(0);
  const [routeTriggerNonce, setRouteTriggerNonce] = useState<number>(1);
  const [routeLoading, setRouteLoading] = useState<boolean>(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routePath, setRoutePath] = useState<LatLngPoint[]>([]);
  const [routeAnalysis, setRouteAnalysis] = useState<CommuteWeatherAnalysis | null>(null);
  const [selectedWaypoint, setSelectedWaypoint] = useState<RouteWaypointWeather | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [focusTarget, setFocusTarget] = useState<CameraFocusTarget | null>(null);

  // Leaflet DOM & Layer Refs
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const radarLayerRef = useRef<L.TileLayer | null>(null);
  const routeLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const gtLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const subModeRef = useRef(subMode);
  subModeRef.current = subMode;

  const lastCityIdRef = useRef<string>(activeCity.id);

  const cityCenter = useMemo<LatLngPoint>(
    () => ({ lat: activeCity.latitude, lng: activeCity.longitude }),
    [activeCity.latitude, activeCity.longitude]
  );

  // Initialize Free Open-Source Leaflet Map (CARTO Dark Matter + OpenStreetMap fallback)
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, {
      center: [activeCity.latitude, activeCity.longitude],
      zoom: 11,
      zoomControl: true,
      attributionControl: true,
    });

    const cartoLayer = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        subdomains: 'abcd',
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap &copy; CARTO',
      }
    );

    let fallbackAdded = false;
    let errorCount = 0;
    let loadedAnyCarto = false;

    cartoLayer.on('tileload', () => {
      loadedAnyCarto = true;
    });

    cartoLayer.on('tileerror', () => {
      errorCount += 1;
      if (!loadedAnyCarto && errorCount >= 3 && !fallbackAdded) {
        fallbackAdded = true;
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);
      }
    });

    cartoLayer.addTo(map);

    const routeGroup = L.layerGroup().addTo(map);
    const gtGroup = L.layerGroup().addTo(map);

    map.on('click', (ev: L.LeafletMouseEvent) => {
      if (subModeRef.current === 'ground-truth') {
        setDraftCoords({
          lat: Number(ev.latlng.lat.toFixed(5)),
          lng: Number(ev.latlng.lng.toFixed(5)),
        });
      }
    });

    mapRef.current = map;
    routeLayerGroupRef.current = routeGroup;
    gtLayerGroupRef.current = gtGroup;

    // Force immediate + animated drawer resize invalidation so tiles render cleanly
    const rafId = window.requestAnimationFrame(() => map.invalidateSize({ animate: false }));
    const resizeTimer = window.setTimeout(() => map.invalidateSize({ animate: false }), 250);
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    resizeObserver.observe(el);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      radarLayerRef.current = null;
      routeLayerGroupRef.current = null;
      gtLayerGroupRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset default origin/destination/draft pin ONLY when user switches active city
  useEffect(() => {
    if (lastCityIdRef.current === activeCity.id) return;
    lastCityIdRef.current = activeCity.id;

    setOrigin({
      label: `${activeCity.name} Center`,
      lat: activeCity.latitude,
      lng: activeCity.longitude,
    });
    setDestination({
      label: `${activeCity.name} Corridor`,
      lat: Number((activeCity.latitude + 0.1).toFixed(4)),
      lng: Number((activeCity.longitude + 0.09).toFixed(4)),
      isDefaultCorridor: true,
    });
    setDraftCoords({ lat: activeCity.latitude, lng: activeCity.longitude });
    setSelectedWaypoint(null);
    setSelectedReportId(null);
    setFocusTarget({
      lat: activeCity.latitude,
      lng: activeCity.longitude,
      zoom: 11,
      nonce: Date.now(),
    });
    setRouteTriggerNonce((n) => n + 1);
  }, [activeCity.id, activeCity.latitude, activeCity.longitude, activeCity.name]);

  // Focus camera on target
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusTarget) return;
    const currentZoom = map.getZoom();
    const targetZoom =
      typeof focusTarget.zoom === 'number'
        ? focusTarget.zoom > currentZoom || focusTarget.zoom <= 11
          ? focusTarget.zoom
          : currentZoom
        : currentZoom;
    map.setView([focusTarget.lat, focusTarget.lng], targetZoom, { animate: true });
  }, [focusTarget]);

  // Auth listener
  useEffect(() => {
    return subscribeToAuthState((u) => {
      setUser(u);
      setVerifiedIds({});
    });
  }, []);

  // Firestore active Ground Truth subscription
  useEffect(() => {
    return subscribeToActiveGroundTruthReports(
      (list) => {
        setReports(list);
        setGtError(null);
      },
      (msg) => setGtError(msg)
    );
  }, []);

  // Load RainViewer radar frames ($0 public API)
  useEffect(() => {
    let active = true;
    setRadarLoading(true);
    fetchRainViewerRadar()
      .then((meta) => {
        if (!active) return;
        setRadarMeta(meta);
        setRadarUnavailable(meta.frames.length === 0);
        if (meta.frames.length > 0) {
          setRadarFrameIndex(meta.latestPastIndex);
        }
      })
      .catch(() => {
        if (active) setRadarUnavailable(true);
      })
      .finally(() => {
        if (active) setRadarLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Radar playback loop
  useEffect(() => {
    if (!radarPlaying || !radarMeta || radarMeta.frames.length <= 1) return;
    const id = window.setInterval(() => {
      setRadarFrameIndex((prev) => (prev + 1) % radarMeta.frames.length);
    }, 900);
    return () => window.clearInterval(id);
  }, [radarPlaying, radarMeta]);

  const activeRadarFrame = radarMeta?.frames[radarFrameIndex] ?? null;

  // Sync RainViewer live radar overlay onto Leaflet map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (radarLayerRef.current) {
      map.removeLayer(radarLayerRef.current);
      radarLayerRef.current = null;
    }

    if (!radarEnabled || !activeRadarFrame?.path) return;

    const host = radarMeta?.host || 'https://tilecache.rainviewer.com';
    const tileUrl = `${host}${activeRadarFrame.path}/256/{z}/{x}/{y}/2/1_1.png`;
    const layer = L.tileLayer(tileUrl, {
      opacity: 0.62,
      maxZoom: 19,
      maxNativeZoom: 16,
      zIndex: 250,
    });
    layer.addTo(map);
    radarLayerRef.current = layer;
  }, [radarEnabled, radarMeta?.host, activeRadarFrame?.path]);

  const departureTimeMs = useMemo(
    () => Date.now() + departureOffsetMins * 60 * 1000,
    [departureOffsetMins, routeTriggerNonce] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Compute $0 OSRM road route + Open-Meteo route waypoint weather sampling
  useEffect(() => {
    if (!origin || !destination || routeTriggerNonce === 0) return;

    let cancelled = false;

    const run = async () => {
      setRouteLoading(true);
      setRouteError(null);

      try {
        let activeDestination = destination;
        let geometry = await fetchFreeCommuteRoute(
          { lat: origin.lat, lng: origin.lng },
          { lat: destination.lat, lng: destination.lng }
        );

        // Coastal safeguard: if synthetic default corridor landed in ocean/no-road area, probe inland quadrants
        if (!geometry && destination.isDefaultCorridor) {
          const fallbackOffsets: Array<[number, number, string]> = [
            [-0.08, -0.08, 'Southwest Corridor'],
            [0.07, -0.09, 'Northwest Corridor'],
            [-0.07, 0.08, 'Southeast Corridor'],
            [0.09, 0.0, 'North Corridor'],
          ];
          for (const [dLat, dLng, suffix] of fallbackOffsets) {
            if (cancelled) return;
            const candidateCoord = {
              lat: Number((origin.lat + dLat).toFixed(4)),
              lng: Number((origin.lng + dLng).toFixed(4)),
            };
            const candidate = await fetchFreeCommuteRoute(
              { lat: origin.lat, lng: origin.lng },
              candidateCoord
            );
            if (candidate) {
              geometry = candidate;
              activeDestination = {
                label: `${origin.label.replace(/ Center$/, '')} ${suffix}`,
                lat: candidateCoord.lat,
                lng: candidateCoord.lng,
                isDefaultCorridor: true,
              };
              setDestination(activeDestination);
              break;
            }
          }
        }

        if (cancelled) return;

        if (!geometry) {
          setRoutePath([]);
          setRouteAnalysis(null);
          setSelectedWaypoint(null);
          setRouteError(
            'No drivable road route found between these two locations. Try picking a nearby street or landmark.'
          );
          return;
        }

        const analysis = await analyzeRouteMicroWeather({
          pathPoints: geometry.pathPoints,
          totalDistanceMeters: geometry.distanceMeters,
          totalDurationMillis: geometry.durationMillis,
          departureTimeMs,
          vehicleMode,
        });

        if (cancelled) return;

        setRoutePath(geometry.pathPoints);
        setRouteAnalysis(analysis);
        setSelectedWaypoint(null);
        setRouteError(null);

        if (subModeRef.current === 'route' && mapRef.current && geometry.pathPoints.length >= 2) {
          const bounds = L.latLngBounds(
            geometry.pathPoints.map((pt) => [pt.lat, pt.lng] as [number, number])
          );
          mapRef.current.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });
        }
      } catch (err) {
        if (!cancelled) {
          setRoutePath([]);
          setRouteAnalysis(null);
          setSelectedWaypoint(null);
          setRouteError(
            err instanceof Error
              ? err.message
              : 'Unable to compute free commute route weather right now.'
          );
        }
      } finally {
        if (!cancelled) {
          setRouteLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [origin, destination, vehicleMode, departureTimeMs, routeTriggerNonce]);

  // Render Leaflet route polyline, Start/End badges, and interactive waypoint weather pills
  useEffect(() => {
    const group = routeLayerGroupRef.current;
    if (!group) return;
    group.clearLayers();

    if (subMode !== 'route') return;

    if (routePath.length >= 2 && routeAnalysis) {
      const strokeColor =
        routeAnalysis.overallRating === 'Hazardous'
          ? '#ef4444'
          : routeAnalysis.overallRating === 'Caution'
            ? '#f59e0b'
            : '#0ea5e9';

      L.polyline(
        routePath.map((p) => [p.lat, p.lng] as [number, number]),
        {
          color: '#020617',
          weight: 9,
          opacity: 0.55,
          lineCap: 'round',
          lineJoin: 'round',
        }
      ).addTo(group);

      L.polyline(
        routePath.map((p) => [p.lat, p.lng] as [number, number]),
        {
          color: strokeColor,
          weight: 5,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
        }
      ).addTo(group);
    }

    if (origin) {
      L.marker([origin.lat, origin.lng], {
        icon: L.divIcon({
          className: '',
          iconSize: [52, 22],
          iconAnchor: [26, 11],
          html: `<div style="padding:2px 6px;border-radius:4px;background:#059669;color:#fff;font-size:10px;font-weight:700;border:1.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.5);text-align:center;white-space:nowrap;">START</div>`,
        }),
      })
        .bindTooltip(escapeHtml(origin.label), { direction: 'top' })
        .addTo(group);
    }

    if (destination) {
      L.marker([destination.lat, destination.lng], {
        icon: L.divIcon({
          className: '',
          iconSize: [44, 22],
          iconAnchor: [22, 11],
          html: `<div style="padding:2px 6px;border-radius:4px;background:#0284c7;color:#fff;font-size:10px;font-weight:700;border:1.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.5);text-align:center;white-space:nowrap;">END</div>`,
        }),
      })
        .bindTooltip(escapeHtml(destination.label), { direction: 'top' })
        .addTo(group);
    }

    if (routeAnalysis) {
      routeAnalysis.waypoints.forEach((wp) => {
        const bg =
          wp.segmentRating === 'Hazardous'
            ? '#dc2626'
            : wp.segmentRating === 'Caution'
              ? '#d97706'
              : '#1e293b';
        const border =
          wp.segmentRating === 'Hazardous'
            ? '#fecaca'
            : wp.segmentRating === 'Caution'
              ? '#fde68a'
              : '#38bdf8';

        const pillLabel = `${escapeHtml(wp.etaLabel)} · ${escapeHtml(
          formatTempWithUnit(wp.temperatureC, unit)
        )}`;

        const marker = L.marker([wp.lat, wp.lng], {
          icon: L.divIcon({
            className: '',
            iconSize: [98, 22],
            iconAnchor: [49, 11],
            html: `<div style="padding:2px 6px;border-radius:5px;background:${bg};color:#fff;font-size:10px;font-weight:600;border:1.5px solid ${border};box-shadow:0 2px 6px rgba(0,0,0,.55);text-align:center;white-space:nowrap;cursor:pointer;">${pillLabel}</div>`,
          }),
        });
        marker.on('click', () => {
          setSelectedWaypoint(wp);
          setSelectedReportId(null);
        });
        marker.addTo(group);
      });
    }
  }, [subMode, routePath, routeAnalysis, origin, destination, unit]);

  // Render Ground Truth pins & draft marker onto Leaflet map
  useEffect(() => {
    const group = gtLayerGroupRef.current;
    if (!group) return;
    group.clearLayers();

    if (subMode === 'ground-truth') {
      L.marker([draftCoords.lat, draftCoords.lng], {
        zIndexOffset: 500,
        icon: L.divIcon({
          className: '',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
          html: `<div style="width:28px;height:28px;border-radius:9999px;background:#fbbf24;border:2.5px solid #fff;color:#020617;font-weight:800;font-size:15px;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,.6);">+</div>`,
        }),
      })
        .bindTooltip('New Ground Truth Pin (Tap map to move)', { direction: 'top' })
        .addTo(group);
    }

    reports.forEach((rep) => {
      const preset = GROUND_TRUTH_TAGS.find((t) => t.tagType === rep.tagType);
      const bg = preset?.colorHex || '#f59e0b';
      const text = `${escapeHtml(preset?.shortLabel || rep.label)} (${rep.verificationsCount})`;

      const marker = L.marker([rep.lat, rep.lng], {
        zIndexOffset: 300,
        icon: L.divIcon({
          className: '',
          iconSize: [110, 22],
          iconAnchor: [55, 11],
          html: `<div style="padding:2px 7px;border-radius:6px;background:${bg};color:#fff;font-size:10px;font-weight:700;border:1.5px solid rgba(255,255,255,.92);box-shadow:0 3px 10px rgba(0,0,0,.6);text-align:center;white-space:nowrap;cursor:pointer;">${text}</div>`,
        }),
      });
      marker.on('click', () => {
        setSelectedReportId(rep.id);
        setSelectedWaypoint(null);
        setFocusTarget({ lat: rep.lat, lng: rep.lng, zoom: 13, nonce: Date.now() });
      });
      marker.addTo(group);
    });
  }, [subMode, draftCoords, reports]);

  // Sort ground truth reports nearest to active city first
  const sortedReports = useMemo(() => {
    return [...reports]
      .map((rep) => ({
        report: rep,
        distanceKm: haversineKm(cityCenter, { lat: rep.lat, lng: rep.lng }),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [reports, cityCenter]);

  const selectedReport = useMemo(
    () => reports.find((r) => r.id === selectedReportId) ?? null,
    [reports, selectedReportId]
  );

  // Check if current signed-in user already verified selected report
  useEffect(() => {
    if (!selectedReport || !user) return;
    if (verifiedIds[selectedReport.id] !== undefined) return;

    checkUserVerifiedReport(selectedReport.id, user.uid)
      .then((already) => {
        setVerifiedIds((prev) => ({ ...prev, [selectedReport.id]: already }));
      })
      .catch(() => {
        // Ignore check failure
      });
  }, [selectedReport, user, verifiedIds]);

  const handleSwapEndpoints = () => {
    if (!origin || !destination) return;
    const prevOrigin = origin;
    const prevDest = destination;
    setOrigin({ ...prevDest, isDefaultCorridor: false });
    setDestination({ ...prevOrigin, isDefaultCorridor: false });
    setRouteTriggerNonce((n) => n + 1);
  };

  const handleUseGpsOrigin = () => {
    if (!navigator.geolocation) {
      setRouteError('Geolocation is not supported in this browser.');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lng = Number(pos.coords.longitude.toFixed(5));
        setOrigin({ label: 'My Current GPS', lat, lng });
        setDraftCoords({ lat, lng });
        setFocusTarget({ lat, lng, zoom: 12, nonce: Date.now() });
        setRouteTriggerNonce((n) => n + 1);
        setGpsLoading(false);
      },
      () => {
        setRouteError(
          'Unable to access GPS location. Check permission or enter a street/city.'
        );
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleUseGpsForTag = () => {
    if (!navigator.geolocation) {
      setGtError('Geolocation is unavailable. Tap the map to position the hazard pin.');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lng = Number(pos.coords.longitude.toFixed(5));
        setDraftCoords({ lat, lng });
        setFocusTarget({ lat, lng, zoom: 14, nonce: Date.now() });
        setGpsLoading(false);
      },
      () => {
        setGtError('GPS permission denied. Tap anywhere on the map to move the hazard pin.');
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleSignIn = async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      await signInWithGooglePopup();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google Sign-In was canceled or blocked.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleDropTag = async () => {
    if (!user) {
      await handleSignIn();
      return;
    }
    setSubmittingTag(true);
    setGtError(null);
    try {
      const id = await createGroundTruthReport({
        tagType: selectedTag,
        note: draftNote,
        lat: draftCoords.lat,
        lng: draftCoords.lng,
        roadOrArea: draftRoad || activeCity.name,
      });
      setDraftNote('');
      setDraftRoad('');
      setSelectedReportId(id);
      setFocusTarget({ lat: draftCoords.lat, lng: draftCoords.lng, zoom: 14, nonce: Date.now() });
    } catch (err) {
      setGtError(err instanceof Error ? err.message : 'Unable to post ground-truth tag.');
    } finally {
      setSubmittingTag(false);
    }
  };

  const handleVerifyReport = async (reportId: string) => {
    setVerifyingId(reportId);
    setGtError(null);
    try {
      await verifyGroundTruthReport(reportId);
      setVerifiedIds((prev) => ({ ...prev, [reportId]: true }));
    } catch (err) {
      setGtError(err instanceof Error ? err.message : 'Unable to verify report.');
    } finally {
      setVerifyingId(null);
    }
  };

  const handleResolveReport = async (reportId: string) => {
    setVerifyingId(reportId);
    setGtError(null);
    try {
      await resolveGroundTruthReport(reportId);
      if (selectedReportId === reportId) {
        setSelectedReportId(null);
      }
    } catch (err) {
      setGtError(err instanceof Error ? err.message : 'Unable to mark report cleared.');
    } finally {
      setVerifyingId(null);
    }
  };

  const focusReportOnMap = (rep: GroundTruthReport) => {
    setSelectedReportId(rep.id);
    setSelectedWaypoint(null);
    setFocusTarget({ lat: rep.lat, lng: rep.lng, zoom: 13, nonce: Date.now() });
  };

  const focusWaypointOnMap = (wp: RouteWaypointWeather) => {
    setSelectedWaypoint(wp);
    setSelectedReportId(null);
    setFocusTarget({ lat: wp.lat, lng: wp.lng, zoom: 12, nonce: Date.now() });
  };

  return (
    <div className="space-y-3.5">
      {/* Top Mode Switcher + Radar Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div
          role="tablist"
          aria-label="Map intelligence mode"
          className="inline-flex items-center gap-1 p-0.5 bg-slate-950 border border-slate-800 rounded-lg"
        >
          <button
            type="button"
            role="tab"
            aria-selected={subMode === 'route'}
            onClick={() => setSubMode('route')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
              subMode === 'route' ? 'bg-sky-600 text-white' : 'text-slate-300 hover:text-white'
            }`}
          >
            <Navigation className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Commute Route Weather</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subMode === 'ground-truth'}
            onClick={() => {
              setSubMode('ground-truth');
              setSelectedWaypoint(null);
              setFocusTarget({
                lat: draftCoords.lat,
                lng: draftCoords.lng,
                zoom: 12,
                nonce: Date.now(),
              });
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
              subMode === 'ground-truth'
                ? 'bg-sky-600 text-white'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Ground Truth ({reports.length})</span>
          </button>
        </div>

        {/* Live Precipitation Radar Bar */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1">
          <button
            type="button"
            onClick={() => setRadarEnabled((v) => !v)}
            className={`text-[11px] font-semibold inline-flex items-center gap-1.5 px-2 py-0.5 rounded transition-colors ${
              radarEnabled ? 'bg-sky-600/20 text-sky-300 border border-sky-500/40' : 'text-slate-400'
            }`}
          >
            <Layers className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Radar {radarEnabled ? 'ON' : 'OFF'}</span>
          </button>

          {radarEnabled && radarLoading && (
            <span className="text-[11px] text-slate-400">Loading frames...</span>
          )}

          {radarEnabled && !radarLoading && radarUnavailable && (
            <span className="text-[11px] text-amber-300">Radar feed unavailable</span>
          )}

          {radarEnabled && radarMeta && radarMeta.frames.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setRadarPlaying((p) => !p)}
                aria-label={radarPlaying ? 'Pause radar loop' : 'Play radar loop'}
                className="p-1 text-slate-300 hover:text-white rounded hover:bg-slate-800"
              >
                {radarPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              </button>
              <span className="text-[11px] font-mono-tabular text-slate-300">
                {activeRadarFrame?.label || 'Live'}
              </span>
              <span
                className="hidden sm:inline-flex items-center gap-1 text-[10px] text-slate-400 pl-1 border-l border-slate-800"
                title="Precipitation intensity"
              >
                <span className="w-2 h-2 rounded-sm bg-sky-400 inline-block" />
                <span>Light</span>
                <span className="w-2 h-2 rounded-sm bg-amber-400 inline-block ml-1" />
                <span>Mod</span>
                <span className="w-2 h-2 rounded-sm bg-rose-500 inline-block ml-1" />
                <span>Heavy</span>
              </span>
            </>
          )}
        </div>
      </div>

      {/* Mode 1: Commute & Micro-Route Weather Inputs */}
      {subMode === 'route' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 space-y-3">
          <div className="flex flex-col md:flex-row md:items-end gap-2">
            <PlaceSearchInput
              label="Origin"
              placeholder="Starting street, landmark, or city"
              valueLabel={origin?.label || ''}
              biasLat={cityCenter.lat}
              biasLng={cityCenter.lng}
              onSelectPlace={(ep) => {
                setOrigin(ep);
                setRouteTriggerNonce((n) => n + 1);
              }}
              onUseGps={handleUseGpsOrigin}
              gpsLoading={gpsLoading}
            />

            <button
              type="button"
              onClick={handleSwapEndpoints}
              disabled={!origin || !destination || routeLoading}
              aria-label="Swap origin and destination"
              title="Swap origin and destination"
              className="self-center md:self-auto md:mb-0.5 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 hover:border-sky-500 text-slate-300 hover:text-white disabled:opacity-50 inline-flex items-center justify-center shrink-0 transition-colors"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>

            <PlaceSearchInput
              label="Destination"
              placeholder="Work, bridge, or destination"
              valueLabel={destination?.label || ''}
              biasLat={cityCenter.lat}
              biasLng={cityCenter.lng}
              onSelectPlace={(ep) => {
                setDestination(ep);
                setRouteTriggerNonce((n) => n + 1);
              }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            {/* Car vs Motorcycle Selector */}
            <div className="flex flex-wrap items-center gap-2">
              <div
                role="group"
                aria-label="Vehicle type"
                className="inline-flex items-center p-0.5 bg-slate-950 border border-slate-800 rounded-lg"
              >
                <button
                  type="button"
                  onClick={() => {
                    setVehicleMode('DRIVING');
                    setRouteTriggerNonce((n) => n + 1);
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
                    vehicleMode === 'DRIVING' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Car className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Driver</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVehicleMode('TWO_WHEELER');
                    setRouteTriggerNonce((n) => n + 1);
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
                    vehicleMode === 'TWO_WHEELER'
                      ? 'bg-amber-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Bike className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Motorcyclist</span>
                </button>
              </div>

              {/* Departure Time Selector */}
              <select
                aria-label="Departure window"
                value={departureOffsetMins}
                onChange={(e) => {
                  setDepartureOffsetMins(Number(e.target.value));
                  setRouteTriggerNonce((n) => n + 1);
                }}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 outline-none focus:border-sky-500"
              >
                <option value={0}>Depart Now</option>
                <option value={30}>Depart +30 min</option>
                <option value={60}>Depart +1 hr</option>
                <option value={180}>Depart +3 hrs</option>
                <option value={360}>Depart +6 hrs</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => setRouteTriggerNonce((n) => n + 1)}
              disabled={routeLoading || !origin || !destination}
              className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${routeLoading ? 'animate-spin' : ''}`} />
              <span>{routeLoading ? 'Sampling Route...' : 'Analyze Commute'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Mode 2: Crowdsourced Ground Truth Reporter */}
      {subMode === 'ground-truth' && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-white">Drop a Verified Condition Tag</p>
              <p className="text-[11px] text-slate-400">
                Tap anywhere on the map to position the pin ({draftCoords.lat.toFixed(4)},{' '}
                {draftCoords.lng.toFixed(4)}), or use GPS.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleUseGpsForTag}
                disabled={gpsLoading}
                className="px-2.5 py-1 rounded-md bg-slate-950 border border-slate-700 hover:border-sky-500 text-xs text-slate-200 inline-flex items-center gap-1 disabled:opacity-50"
              >
                <Crosshair className="w-3.5 h-3.5 text-sky-400" />
                <span>{gpsLoading ? 'Locating...' : 'Pin GPS'}</span>
              </button>

              {user ? (
                <div className="inline-flex items-center gap-2 bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1 text-[11px] text-slate-200">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="max-w-[110px] truncate">{user.displayName || 'Observer'}</span>
                  <button
                    type="button"
                    onClick={() => void signOutFirebase()}
                    className="text-slate-400 hover:text-white underline"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleSignIn()}
                  disabled={authBusy}
                  className="px-2.5 py-1 rounded-md bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white inline-flex items-center gap-1.5"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{authBusy ? 'Signing in...' : 'Sign in with Google'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Tag Quick-Pick Buttons */}
          <div className="flex flex-wrap gap-1.5">
            {GROUND_TRUTH_TAGS.map((tag) => {
              const active = selectedTag === tag.tagType;
              return (
                <button
                  key={tag.tagType}
                  type="button"
                  onClick={() => setSelectedTag(tag.tagType)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                    active
                      ? 'bg-slate-800 border-sky-400 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {tag.shortLabel}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              maxLength={100}
              value={draftRoad}
              onChange={(e) => setDraftRoad(e.target.value)}
              placeholder="Bridge, street, or exit (optional)"
              className="bg-slate-950 border border-slate-700 focus:border-sky-500 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 outline-none"
            />
            <input
              type="text"
              maxLength={180}
              value={draftNote}
              onChange={(e) => setDraftNote(e.target.value)}
              placeholder="Quick note (e.g., right lane flooded 6 in)"
              className="bg-slate-950 border border-slate-700 focus:border-sky-500 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 outline-none"
            />
            <button
              type="button"
              onClick={() => void handleDropTag()}
              disabled={submittingTag || authBusy}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-xs font-semibold text-white inline-flex items-center justify-center gap-1.5 transition-colors"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>
                {!user
                  ? authBusy
                    ? 'Signing in...'
                    : 'Sign in with Google to Post'
                  : submittingTag
                    ? 'Posting...'
                    : 'Drop Ground Truth Tag'}
              </span>
            </button>
          </div>

          {(authError || gtError) && (
            <p className="text-xs text-red-300 bg-red-950/60 border border-red-800/70 rounded-lg px-3 py-2">
              {authError || gtError}
            </p>
          )}
        </div>
      )}

      {/* Interactive $0 OpenStreetMap / CARTO Dark Leaflet Map + Overlay Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="habari-leaflet-map lg:col-span-7 relative w-full h-[260px] sm:h-[340px] lg:h-[390px] rounded-xl overflow-hidden border border-slate-700/80 bg-slate-950">
          <div ref={mapContainerRef} className="w-full h-full z-10" />

          {/* Selected Waypoint Inspection Card (Safe React Overlay inside Map) */}
          {subMode === 'route' && selectedWaypoint && (
            <div className="absolute bottom-3 left-3 right-3 sm:right-auto sm:max-w-[290px] z-[450] bg-slate-950/95 border border-slate-700 rounded-xl p-3 shadow-2xl space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs font-bold text-white">
                  Segment ETA {selectedWaypoint.etaLabel} · {selectedWaypoint.segmentRating}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedWaypoint(null)}
                  aria-label="Close segment details"
                  className="text-slate-400 hover:text-white p-0.5 rounded"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="text-[11px] text-slate-200 font-mono-tabular">
                {selectedWaypoint.conditionLabel} ·{' '}
                {formatTempWithUnit(selectedWaypoint.temperatureC, unit)}
              </div>
              <div className="text-[11px] text-amber-300 font-mono-tabular">
                Crosswind: {formatWind(selectedWaypoint.crosswindGustKmh, unit)} (
                {selectedWaypoint.crosswindSide})
              </div>
              <div className="text-[11px] text-sky-300 font-mono-tabular">
                Ice Risk: {selectedWaypoint.iceRisk} · Rain{' '}
                {selectedWaypoint.precipitationMm.toFixed(1)} mm/h
              </div>
              <p className="text-[11px] text-slate-400">{selectedWaypoint.hazardNote}</p>
            </div>
          )}

          {/* Selected Ground Truth Pin Inspection Card */}
          {selectedReport && (
            <div className="absolute bottom-3 left-3 right-3 sm:right-auto sm:max-w-[300px] z-[450] bg-slate-950/95 border border-slate-700 rounded-xl p-3 shadow-2xl space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs font-bold text-white truncate">{selectedReport.label}</div>
                <button
                  type="button"
                  onClick={() => setSelectedReportId(null)}
                  aria-label="Close hazard details"
                  className="text-slate-400 hover:text-white p-0.5 rounded shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="text-[11px] text-slate-300 truncate">{selectedReport.roadOrArea}</div>
              {selectedReport.note && (
                <p className="text-[11px] text-slate-200 leading-snug">{selectedReport.note}</p>
              )}
              <div className="text-[10px] text-slate-400">
                by {selectedReport.authorName} · {selectedReport.verificationsCount} verified
              </div>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {user && selectedReport.authorUid !== user.uid && (
                  <button
                    type="button"
                    disabled={
                      Boolean(verifiedIds[selectedReport.id]) || verifyingId === selectedReport.id
                    }
                    onClick={() => void handleVerifyReport(selectedReport.id)}
                    className="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-semibold disabled:opacity-50"
                  >
                    {verifiedIds[selectedReport.id] ? 'Verified' : 'Verify (+1)'}
                  </button>
                )}
                {user && selectedReport.authorUid === user.uid && (
                  <button
                    type="button"
                    disabled={verifyingId === selectedReport.id}
                    onClick={() => void handleResolveReport(selectedReport.id)}
                    className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold disabled:opacity-50"
                  >
                    Mark Cleared
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Route Segments Summary OR Live Ground Truth Feed */}
        <div className="lg:col-span-5 flex flex-col gap-2.5 lg:max-h-[390px] lg:overflow-y-auto lg:pr-1">
          {subMode === 'route' ? (
            <>
              {routeError && (
                <div className="p-3 rounded-xl bg-red-950/60 border border-red-800 text-xs text-red-200 space-y-1.5">
                  <p>{routeError}</p>
                  <button
                    type="button"
                    onClick={() => setRouteTriggerNonce((n) => n + 1)}
                    className="px-2.5 py-1 rounded-md bg-red-800/80 hover:bg-red-700 text-[11px] font-semibold text-white"
                  >
                    Retry Route
                  </button>
                </div>
              )}

              {routeAnalysis ? (
                <>
                  <div
                    className={`p-3 rounded-xl border ${
                      routeAnalysis.overallRating === 'Hazardous'
                        ? 'bg-red-950/40 border-red-700/80'
                        : routeAnalysis.overallRating === 'Caution'
                          ? 'bg-amber-950/40 border-amber-700/80'
                          : 'bg-emerald-950/30 border-emerald-700/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-white">
                        {routeAnalysis.vehicleMode === 'TWO_WHEELER' ? 'Motorcycle' : 'Drive'} Risk:{' '}
                        {routeAnalysis.overallRating}
                      </span>
                      <span className="text-xs font-mono-tabular text-slate-200">
                        {unit === 'F'
                          ? `${(routeAnalysis.distanceKm * 0.621371).toFixed(1)} mi`
                          : `${routeAnalysis.distanceKm.toFixed(1)} km`}{' '}
                        · {routeAnalysis.durationMinutes} min
                      </span>
                    </div>
                    <p className="text-xs text-slate-200 mt-1">{routeAnalysis.summaryText}</p>
                    {routeAnalysis.vehicleMode === 'TWO_WHEELER' && (
                      <p className="text-[11px] text-amber-300/90 mt-1">
                        Heightened motorcycle crosswind, rain spray, and freeze thresholds applied.
                      </p>
                    )}
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] font-mono-tabular">
                      <div className="bg-slate-950/70 rounded-md px-2 py-1 border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">Peak Crosswind</span>
                        <span className="text-amber-300 font-semibold">
                          {formatWind(routeAnalysis.maxCrosswindKmh, unit)}
                        </span>
                      </div>
                      <div className="bg-slate-950/70 rounded-md px-2 py-1 border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">Peak Rain</span>
                        <span className="text-sky-300 font-semibold">
                          {routeAnalysis.maxRainMm.toFixed(1)} mm/h
                        </span>
                      </div>
                      <div className="bg-slate-950/70 rounded-md px-2 py-1 border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">Ice Risk</span>
                        <span
                          className={`font-semibold ${
                            routeAnalysis.hasIceRisk ? 'text-red-300' : 'text-emerald-300'
                          }`}
                        >
                          {routeAnalysis.hasIceRisk ? 'Alert' : 'Clear'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Per-Segment Timeline */}
                  <div className="space-y-2">
                    {routeAnalysis.waypoints.map((wp) => (
                      <button
                        key={wp.index}
                        type="button"
                        onClick={() => focusWaypointOnMap(wp)}
                        className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                          selectedWaypoint?.index === wp.index
                            ? 'bg-slate-800 border-sky-500'
                            : 'bg-slate-900/90 hover:bg-slate-800/90 border-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono-tabular font-semibold text-white">
                            {wp.etaLabel} ·{' '}
                            {unit === 'F'
                              ? `${(wp.distanceFromStartKm * 0.621371).toFixed(1)} mi`
                              : `${wp.distanceFromStartKm.toFixed(1)} km`}
                          </span>
                          <span
                            className={`text-[11px] font-semibold ${
                              wp.segmentRating === 'Hazardous'
                                ? 'text-red-400'
                                : wp.segmentRating === 'Caution'
                                  ? 'text-amber-300'
                                  : 'text-emerald-300'
                            }`}
                          >
                            {wp.segmentRating}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-300 font-mono-tabular">
                          <span>
                            {wp.conditionLabel} {formatTempWithUnit(wp.temperatureC, unit)}
                          </span>
                          <span className="inline-flex items-center gap-1 text-sky-300">
                            <Droplets className="w-3 h-3" />
                            {wp.precipitationMm.toFixed(1)} mm
                          </span>
                          <span className="inline-flex items-center gap-1 text-amber-300">
                            <Wind className="w-3 h-3" />
                            X-wind {formatWind(wp.crosswindGustKmh, unit)} ({wp.crosswindSide})
                          </span>
                          {wp.iceRisk !== 'None' && (
                            <span className="inline-flex items-center gap-1 text-cyan-300">
                              <Snowflake className="w-3 h-3" />
                              {wp.iceRisk}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">{wp.hazardNote}</p>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 text-xs text-slate-400 flex items-center gap-2">
                  <Compass className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>
                    {routeLoading
                      ? 'Computing road route and sampling time-synced micro-weather...'
                      : 'Enter an origin and destination to see mile-by-mile rain, ice, and crosswind conditions.'}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-2">
              {sortedReports.length === 0 ? (
                <div className="p-5 rounded-xl bg-slate-900/70 border border-slate-800 text-center space-y-1.5">
                  <CloudRain className="w-5 h-5 text-sky-400 mx-auto" />
                  <p className="text-xs font-semibold text-white">No active hazard tags yet</p>
                  <p className="text-[11px] text-slate-400">
                    Tap anywhere on the map to position a pin and post the first local condition tag.
                  </p>
                </div>
              ) : (
                sortedReports.map(({ report: rep, distanceKm }) => {
                  const isOwn = Boolean(user && rep.authorUid === user.uid);
                  const alreadyVerified = Boolean(verifiedIds[rep.id]);
                  const distLabel =
                    unit === 'F'
                      ? `${(distanceKm * 0.621371).toFixed(1)} mi away`
                      : `${distanceKm.toFixed(1)} km away`;
                  return (
                    <div
                      key={rep.id}
                      onClick={() => focusReportOnMap(rep)}
                      className={`p-3 rounded-xl border cursor-pointer transition-colors ${
                        selectedReportId === rep.id
                          ? 'bg-slate-800 border-sky-500'
                          : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span className="truncate">{rep.label}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 truncate mt-0.5">
                            {rep.roadOrArea} · {distLabel} · {formatRelativeAge(rep.createdAtMs)}
                          </div>
                        </div>
                        <span className="text-[11px] font-mono-tabular font-semibold text-sky-300 shrink-0">
                          {rep.verificationsCount} verified
                        </span>
                      </div>

                      {rep.note && (
                        <p className="text-xs text-slate-200 mt-1.5 leading-relaxed">{rep.note}</p>
                      )}

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-[10px] text-slate-500 truncate">
                          by {rep.authorName}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          {isOwn ? (
                            <button
                              type="button"
                              disabled={verifyingId === rep.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleResolveReport(rep.id);
                              }}
                              className="px-2.5 py-1 rounded-md bg-emerald-700 hover:bg-emerald-600 text-[11px] font-semibold text-white inline-flex items-center gap-1 disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Mark Cleared</span>
                            </button>
                          ) : user ? (
                            <button
                              type="button"
                              disabled={alreadyVerified || verifyingId === rep.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleVerifyReport(rep.id);
                              }}
                              className="px-2.5 py-1 rounded-md bg-sky-700 hover:bg-sky-600 text-[11px] font-semibold text-white inline-flex items-center gap-1 disabled:opacity-50"
                            >
                              <ThumbsUp className="w-3 h-3" />
                              <span>{alreadyVerified ? 'Verified' : 'Confirm (+1)'}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleSignIn();
                              }}
                              className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[11px] font-medium text-sky-300"
                            >
                              Sign in to verify
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
