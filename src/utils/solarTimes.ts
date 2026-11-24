export interface SolarTimesResult {
  sunriseLabel: string;
  sunsetLabel: string;
  daylightDurationLabel: string;
  polarState: 'normal' | 'midnight-sun' | 'polar-night';
  sunriseMinutes: number | null;
  sunsetMinutes: number | null;
}

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

function modPositive(val: number, period: number): number {
  return ((val % period) + period) % period;
}

function getCityDateParts(timezone: string): { year: number; month: number; day: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const year = Number(parts.find((p) => p.type === 'year')?.value);
    const month = Number(parts.find((p) => p.type === 'month')?.value);
    const day = Number(parts.find((p) => p.type === 'day')?.value);
    if (year && month && day) return { year, month, day };
  } catch {
    // Fallback to UTC date
  }
  const now = new Date();
  return {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    day: now.getUTCDate(),
  };
}

function dayOfYear(year: number, month: number, day: number): number {
  const n1 = Math.floor((275 * month) / 9);
  const n2 = Math.floor((month + 9) / 12);
  const n3 = 1 + Math.floor((year - 4 * Math.floor(year / 4) + 2) / 3);
  return n1 - n2 * n3 + day - 30;
}

function computeSolarEventHoursUtc(
  n: number,
  latitude: number,
  longitude: number,
  isSunrise: boolean
): number | 'polar-night' | 'midnight-sun' {
  const lngHour = longitude / 15;
  const t = n + ((isSunrise ? 6 : 18) - lngHour) / 24;

  // Sun's mean anomaly
  const m = 0.9856 * t - 3.289;

  // Sun's true longitude
  let l =
    m +
    1.916 * Math.sin(m * DEG2RAD) +
    0.02 * Math.sin(2 * m * DEG2RAD) +
    282.634;
  l = modPositive(l, 360);

  // Sun's right ascension
  let ra = Math.atan(0.91764 * Math.tan(l * DEG2RAD)) * RAD2DEG;
  ra = modPositive(ra, 360);
  const lQuad = Math.floor(l / 90) * 90;
  const raQuad = Math.floor(ra / 90) * 90;
  ra = (ra + (lQuad - raQuad)) / 15;

  // Sun's declination
  const sinDec = 0.39782 * Math.sin(l * DEG2RAD);
  const cosDec = Math.cos(Math.asin(sinDec));

  // Zenith = 90 deg 50 min (official sunrise/sunset accounting for refraction)
  const cosZenith = Math.cos(90.8333 * DEG2RAD);
  const cosH =
    (cosZenith - sinDec * Math.sin(latitude * DEG2RAD)) /
    (cosDec * Math.cos(latitude * DEG2RAD));

  if (cosH > 1) return 'polar-night';
  if (cosH < -1) return 'midnight-sun';

  const h = isSunrise
    ? (360 - Math.acos(cosH) * RAD2DEG) / 15
    : (Math.acos(cosH) * RAD2DEG) / 15;

  const localMeanTime = h + ra - 0.06571 * t - 6.622;
  return modPositive(localMeanTime - lngHour, 24);
}

function formatHoursMinutes12h(totalMinutes: number): string {
  const normalized = modPositive(Math.round(totalMinutes), 1440);
  const h24 = Math.floor(normalized / 60);
  const mins = normalized % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(mins).padStart(2, '0')} ${period}`;
}

export function calculateSolarTimes(
  latitude: number,
  longitude: number,
  timezone: string,
  utcOffsetSeconds: number
): SolarTimesResult {
  const { year, month, day } = getCityDateParts(timezone);
  const n = dayOfYear(year, month, day);
  const offsetHours = utcOffsetSeconds / 3600;

  const riseUtc = computeSolarEventHoursUtc(n, latitude, longitude, true);
  const setUtc = computeSolarEventHoursUtc(n, latitude, longitude, false);

  if (riseUtc === 'polar-night' || setUtc === 'polar-night') {
    return {
      sunriseLabel: 'No sunrise',
      sunsetLabel: 'Polar night',
      daylightDurationLabel: '0h 00m daylight',
      polarState: 'polar-night',
      sunriseMinutes: null,
      sunsetMinutes: null,
    };
  }

  if (riseUtc === 'midnight-sun' || setUtc === 'midnight-sun') {
    return {
      sunriseLabel: 'Midnight sun',
      sunsetLabel: 'No sunset',
      daylightDurationLabel: '24h 00m daylight',
      polarState: 'midnight-sun',
      sunriseMinutes: null,
      sunsetMinutes: null,
    };
  }

  const riseLocalHours = modPositive(riseUtc + offsetHours, 24);
  const setLocalHours = modPositive(setUtc + offsetHours, 24);

  const sunriseMinutes = Math.round(riseLocalHours * 60);
  const sunsetMinutes = Math.round(setLocalHours * 60);

  let diffMinutes = sunsetMinutes - sunriseMinutes;
  if (diffMinutes < 0) diffMinutes += 1440;
  const durH = Math.floor(diffMinutes / 60);
  const durM = diffMinutes % 60;

  return {
    sunriseLabel: formatHoursMinutes12h(sunriseMinutes),
    sunsetLabel: formatHoursMinutes12h(sunsetMinutes),
    daylightDurationLabel: `${durH}h ${String(durM).padStart(2, '0')}m daylight`,
    polarState: 'normal',
    sunriseMinutes,
    sunsetMinutes,
  };
}
