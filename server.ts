import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

function buildPlainEnglishDailySummary(
  cityName: string,
  unit: 'F' | 'C',
  current: {
    temperatureC?: number;
    apparentTemperatureC?: number;
    precipitationProbability?: number;
    windGustsKmh?: number;
    weatherCode?: number;
  },
  hourly: Array<{
    timeIso?: string;
    temperatureC?: number;
    precipitationProbability?: number;
    precipitationMm?: number;
    windGustsKmh?: number;
    weatherCode?: number;
  }>
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

  const wetIndex = hourly.findIndex(
    (h) => Number(h.precipitationProbability ?? 0) >= 45 || Number(h.precipitationMm ?? 0) >= 0.4
  );
  const wetHour = wetIndex >= 0 ? hourly[wetIndex] : null;
  const heavyWet = hourly.some((h) => Number(h.precipitationMm ?? 0) >= 2.5);
  const stormRisk = hourly.some((h) => Number(h.weatherCode ?? 0) >= 95);

  const nowTemp = Number(current.temperatureC ?? 15);
  const temps = [nowTemp, ...hourly.map((h) => Number(h.temperatureC ?? nowTemp))];
  const hiC = Math.max(...temps);
  const loC = Math.min(...temps);
  const swingDeg = unit === 'F' ? Math.round(((hiC - loC) * 9) / 5) : Math.round(hiC - loC);
  const peakGust = Math.max(
    Number(current.windGustsKmh ?? 0),
    ...hourly.map((h) => Number(h.windGustsKmh ?? 0))
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

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'habari-weather', costTier: '$0-free' });
  });

  // Google Play Store Trusted Web Activity (TWA) Digital Asset Links endpoint
  app.get('/.well-known/assetlinks.json', (_req, res) => {
    const packageName = process.env.ANDROID_PACKAGE_NAME || 'app.habariweather.twa';
    const rawFingerprints =
      process.env.ANDROID_SHA256_FINGERPRINT ||
      'REPLACE_WITH_PLAY_APP_SIGNING_SHA256_FINGERPRINT';
    const fingerprints = rawFingerprints
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    res.type('application/json').json([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: packageName,
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ]);
  });

  // Google Play Store & PWA Privacy Policy + Open Data Attribution page
  app.get('/privacy', (_req, res) => {
    res.type('text/html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Privacy Policy — Habari Weather</title>
    <style>
      body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #020617; color: #e2e8f0; line-height: 1.65; }
      main { max-width: 720px; margin: 0 auto; padding: 36px 20px 64px; }
      h1, h2 { color: #ffffff; }
      a { color: #38bdf8; }
      .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 18px 20px; margin-top: 18px; }
      .back { display: inline-block; margin-bottom: 16px; text-decoration: none; font-weight: 600; }
    </style>
  </head>
  <body>
    <main>
      <a class="back" href="/">&larr; Back to Habari Weather</a>
      <h1>Habari Weather Privacy Policy</h1>
      <p>Habari Weather is a free, zero-ad, zero-subscription weather observatory and commute micro-weather tool.</p>
      <div class="card">
        <h2>1. Location &amp; GPS Data</h2>
        <p>Saved cities and temperature units are stored locally on your device via browser storage. If you choose to tap <strong>My GPS</strong> or <strong>Pin GPS</strong>, your coordinates are sent directly to open weather and routing feeds solely to display local conditions and road weather. We do not track background location.</p>
      </div>
      <div class="card">
        <h2>2. Optional Google Sign-In &amp; Community Reports</h2>
        <p>Signing in with Google via Firebase Authentication is optional and only required if you post or verify crowdsourced Ground Truth hazard tags or sync custom threshold alert rules across devices. Active Ground Truth pins show your display name and automatically expire after 6 hours.</p>
      </div>
      <div class="card">
        <h2>3. Free &amp; Open Data Sources ($0)</h2>
        <ul>
          <li><strong>Forecasts &amp; Multi-Model Confidence:</strong> Open-Meteo (GFS, ECMWF, ICON) &amp; NOAA/National Weather Service</li>
          <li><strong>Live Precipitation Radar:</strong> RainViewer Public Weather Maps</li>
          <li><strong>Map Tiles, Search &amp; Road Routing:</strong> OpenStreetMap contributors, CARTO Dark Matter basemaps, Photon Geocoder, and OSRM</li>
        </ul>
      </div>
    </main>
  </body>
</html>`);
  });

  const serverCache = new Map<string, { expiresAt: number; payload: unknown }>();
  function getCached(key: string) {
    const entry = serverCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      serverCache.delete(key);
      return null;
    }
    return entry.payload;
  }
  function setCached(key: string, payload: unknown, ttlMs = 10 * 60 * 1000) {
    serverCache.set(key, { expiresAt: Date.now() + ttlMs, payload });
  }

  // Zero-cost deterministic 2-sentence plain-English daily weather summary for the top HUD
  app.post('/api/daily-summary', (req, res) => {
    try {
      const cityName =
        typeof req.body?.cityName === 'string' ? req.body.cityName.slice(0, 80) : 'Your Area';
      const unit = req.body?.unit === 'C' ? 'C' : 'F';
      const current = req.body?.current;
      const hourly = Array.isArray(req.body?.hourly) ? req.body.hourly.slice(0, 18) : [];

      if (!current || hourly.length === 0) {
        return res.status(400).json({ error: 'Current and hourly forecast data are required.' });
      }

      const cacheKey = `summary:${cityName}:${unit}:${String(current.observationTimeIso || '')}`;
      const cached = getCached(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      const payload = {
        summary: buildPlainEnglishDailySummary(cityName, unit, current, hourly),
      };
      setCached(cacheKey, payload);
      return res.json(payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate daily summary.';
      return res.status(500).json({ error: msg });
    }
  });

  const httpServer = http.createServer(app);

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
        hmr: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Habari Weather server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
