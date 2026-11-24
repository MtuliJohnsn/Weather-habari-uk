import { AlertPreferences, WeatherAlert } from '../types/weather';

export type BrowserPermissionState = NotificationPermission | 'unsupported';

export function getNotificationSupportAndPermission(): BrowserPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<BrowserPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return Notification.permission;
  }
}

export function shouldNotifyForAlert(alert: WeatherAlert, prefs: AlertPreferences): boolean {
  if (!prefs.enabled) return false;
  if (alert.source === 'NWS') return true;
  if (alert.category === 'storm' && prefs.notifyStorms) return true;
  if (alert.category === 'wind' && prefs.notifyHighWind) return true;
  if ((alert.category === 'heat' || alert.category === 'cold') && prefs.notifyExtremeTemp) return true;
  if (alert.category === 'precipitation' && prefs.notifyHeavyPrecip) return true;
  return false;
}

export function dispatchPushNotification(
  title: string,
  body: string,
  tag?: string
): { deliveredNative: boolean; reason?: string } {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { deliveredNative: false, reason: 'Browser notifications unavailable' };
  }

  if (Notification.permission !== 'granted') {
    return { deliveredNative: false, reason: 'Permission not granted' };
  }

  try {
    const notification = new Notification(title, {
      body,
      tag: tag || 'habari-weather-alert',
      requireInteraction: false,
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    return { deliveredNative: true };
  } catch {
    return {
      deliveredNative: false,
      reason: 'Native popup blocked in embedded preview; shown in-app.',
    };
  }
}
