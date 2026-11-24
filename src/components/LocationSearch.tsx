import { useEffect, useRef, useState } from 'react';
import { LocateFixed, MapPin, Search, X } from 'lucide-react';
import { CityLocation } from '../types/weather';
import { reverseGeocodeCity, searchCities } from '../services/weatherApi';

interface LocationSearchProps {
  currentCity: CityLocation;
  savedCities: CityLocation[];
  onSelectCity: (city: CityLocation) => void;
  onRemoveSavedCity: (cityId: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  compact?: boolean;
}

export function LocationSearch({
  currentCity,
  savedCities,
  onSelectCity,
  onRemoveSavedCity,
  inputRef,
  compact = false,
}: LocationSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CityLocation[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    setIsSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const cities = await searchCities(trimmed);
        if (!cancelled) {
          setResults(cities);
          setIsOpen(true);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    }, 240);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const handleUseMyLocation = () => {
    setGeoError(null);
    if (!('geolocation' in navigator)) {
      setGeoError('Geolocation is not supported in this browser.');
      return;
    }

    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const city = await reverseGeocodeCity(pos.coords.latitude, pos.coords.longitude);
          onSelectCity(city);
          setQuery('');
          setIsOpen(false);
        } catch {
          setGeoError('Could not resolve your city name.');
        } finally {
          setGeoLoading(false);
        }
      },
      (err) => {
        setGeoLoading(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGeoError('Location permission denied.');
        } else {
          setGeoError('Unable to detect location.');
        }
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  };

  const handleChoose = (city: CityLocation) => {
    onSelectCity(city);
    setQuery('');
    setResults([]);
    setIsOpen(false);
    setGeoError(null);
  };

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div className="flex items-center gap-2">
        <div ref={containerRef} className="relative flex-1 min-w-0">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onFocus={() => {
              if (results.length > 0) setIsOpen(true);
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              setGeoError(null);
            }}
            placeholder="Change city (e.g., Tokyo, Seattle, Reykjavik)..."
            aria-label="Search city location"
            className="w-full h-9 pl-9 pr-8 bg-slate-950/90 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setResults([]);
                setIsOpen(false);
              }}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {isOpen && query.trim().length >= 2 && (
            <div className="absolute z-50 left-0 right-0 mt-1.5 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl overflow-hidden">
              {isSearching ? (
                <div className="px-3.5 py-2.5 text-xs text-slate-400">Searching cities...</div>
              ) : results.length === 0 ? (
                <div className="px-3.5 py-2.5 text-xs text-slate-400">
                  No matching cities found for &ldquo;{query.trim()}&rdquo;.
                </div>
              ) : (
                <ul
                  role="listbox"
                  aria-label="City search results"
                  className="divide-y divide-slate-800 max-h-64 overflow-y-auto"
                >
                  {results.map((city) => (
                    <li key={city.id}>
                      <button
                        type="button"
                        onClick={() => handleChoose(city)}
                        className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-slate-800 focus-visible:bg-slate-800 focus-visible:outline-none transition-colors"
                      >
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-white">{city.name}</span>
                          <span className="text-xs text-slate-400 ml-2">
                            {[city.admin1, city.country].filter(Boolean).join(', ')}
                          </span>
                        </div>
                        <span className="text-xs font-mono-tabular text-slate-400 whitespace-nowrap shrink-0">
                          {city.latitude.toFixed(1)}°, {city.longitude.toFixed(1)}°
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleUseMyLocation}
          disabled={geoLoading}
          title="Use my current location"
          className="h-9 px-3 inline-flex items-center justify-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-medium text-slate-100 hover:bg-slate-700 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
        >
          <LocateFixed className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
          <span className="hidden sm:inline">{geoLoading ? 'Locating...' : 'My Location'}</span>
        </button>
      </div>

      {geoError && (
        <p className="text-xs text-red-400" role="alert">
          {geoError}
        </p>
      )}

      {!compact && (
        <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
          <span className="text-xs font-medium text-slate-400 whitespace-nowrap shrink-0">
            Saved:
          </span>
          <div className="flex items-center gap-1.5">
            {savedCities.map((city) => {
              const isActive =
                city.id === currentCity.id ||
                (Math.abs(city.latitude - currentCity.latitude) < 0.02 &&
                  Math.abs(city.longitude - currentCity.longitude) < 0.02);
              return (
                <div
                  key={city.id}
                  className={`inline-flex items-center rounded-md border text-xs transition-colors whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-sky-600 border-sky-500 text-white'
                      : 'bg-slate-800/90 border-slate-700 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleChoose(city)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 font-medium whitespace-nowrap shrink-0"
                  >
                    <MapPin className="w-3 h-3 opacity-80" aria-hidden="true" />
                    <span>{city.name}</span>
                  </button>
                  {savedCities.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onRemoveSavedCity(city.id)}
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
        </div>
      )}
    </div>
  );
}
