import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
} from 'lucide-react';

interface WeatherIconProps {
  code: number;
  isDay?: boolean;
  className?: string;
}

export function WeatherIcon({ code, isDay = true, className = 'w-6 h-6' }: WeatherIconProps) {
  if (code === 0 || code === 1) {
    return isDay ? (
      <Sun className={`${className} text-amber-500`} aria-hidden="true" />
    ) : (
      <Moon className={`${className} text-slate-600`} aria-hidden="true" />
    );
  }
  if (code === 2) {
    return isDay ? (
      <CloudSun className={`${className} text-amber-500`} aria-hidden="true" />
    ) : (
      <Cloud className={`${className} text-slate-500`} aria-hidden="true" />
    );
  }
  if (code === 3) {
    return <Cloud className={`${className} text-slate-500`} aria-hidden="true" />;
  }
  if (code === 45 || code === 48) {
    return <CloudFog className={`${className} text-slate-400`} aria-hidden="true" />;
  }
  if (code >= 51 && code <= 57) {
    return <CloudDrizzle className={`${className} text-blue-500`} aria-hidden="true" />;
  }
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
    return <CloudRain className={`${className} text-blue-600`} aria-hidden="true" />;
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return <CloudSnow className={`${className} text-sky-500`} aria-hidden="true" />;
  }
  if (code >= 95) {
    return <CloudLightning className={`${className} text-amber-600`} aria-hidden="true" />;
  }
  return <Cloud className={`${className} text-slate-500`} aria-hidden="true" />;
}
