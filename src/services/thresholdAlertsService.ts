import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { formatTempWithUnit, formatWind } from './weatherApi';
import { TemperatureUnit, WeatherBundle } from '../types/weather';

export type ThresholdRuleType =
  | 'jacket_or_umbrella'
  | 'jacket'
  | 'umbrella'
  | 'wind'
  | 'freeze'
  | 'open_windows';

export interface ThresholdAlertRule {
  id: string;
  userId?: string;
  title: string;
  ruleType: ThresholdRuleType;
  checkTime: string; // HH:MM
  cityId: string;
  cityName: string;
  tempThresholdC: number;
  rainProbThreshold: number;
  windThresholdKmh: number;
  enabled: boolean;
}

export interface ThresholdRuleEvaluation {
  triggered: boolean;
  headline: string;
  detail: string;
}

const LOCAL_STORAGE_KEY = 'habari_threshold_rules_v1';

export const DEFAULT_RULE_PRESETS: Array<{
  ruleType: ThresholdRuleType;
  title: string;
  checkTime: string;
  tempThresholdC: number;
  rainProbThreshold: number;
  windThresholdKmh: number;
}> = [
  {
    ruleType: 'jacket_or_umbrella',
    title: 'Alert at 7:00 AM only if I need a jacket or umbrella today',
    checkTime: '07:00',
    tempThresholdC: 15,
    rainProbThreshold: 40,
    windThresholdKmh: 35,
  },
  {
    ruleType: 'umbrella',
    title: 'Alert at 7:30 AM if rain chance exceeds 45% today',
    checkTime: '07:30',
    tempThresholdC: 15,
    rainProbThreshold: 45,
    windThresholdKmh: 35,
  },
  {
    ruleType: 'wind',
    title: 'Alert at 7:00 AM if gusts exceed 25 mph (40 km/h)',
    checkTime: '07:00',
    tempThresholdC: 15,
    rainProbThreshold: 40,
    windThresholdKmh: 40,
  },
  {
    ruleType: 'freeze',
    title: 'Alert at 6:00 PM if overnight freeze threatens plants',
    checkTime: '18:00',
    tempThresholdC: 2,
    rainProbThreshold: 30,
    windThresholdKmh: 35,
  },
  {
    ruleType: 'open_windows',
    title: 'Alert at 8:00 AM when fresh-air window weather hits',
    checkTime: '08:00',
    tempThresholdC: 16,
    rainProbThreshold: 20,
    windThresholdKmh: 24,
  },
];

export function loadLocalThresholdRules(): ThresholdAlertRule[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLocalThresholdRules(rules: ThresholdAlertRule[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(rules.slice(0, 20)));
  } catch {
    // Ignore storage error
  }
}

function buildSafeRuleId(): string {
  const rand = Math.random().toString(36).slice(2, 9);
  return `rule_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function subscribeToUserThresholdRules(
  uid: string,
  onUpdate: (rules: ThresholdAlertRule[]) => void,
  onError?: (msg: string) => void
): () => void {
  const path = `users/${uid}/thresholdRules`;
  const q = query(collection(db, 'users', uid, 'thresholdRules'), where('userId', '==', uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: ThresholdAlertRule[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        list.push({
          id: docSnap.id,
          userId: String(d.userId || uid),
          title: String(d.title || ''),
          ruleType: (d.ruleType as ThresholdRuleType) || 'jacket_or_umbrella',
          checkTime: String(d.checkTime || '07:00'),
          cityId: String(d.cityId || ''),
          cityName: String(d.cityName || ''),
          tempThresholdC: Number(d.tempThresholdC ?? 15),
          rainProbThreshold: Number(d.rainProbThreshold ?? 40),
          windThresholdKmh: Number(d.windThresholdKmh ?? 40),
          enabled: Boolean(d.enabled),
        });
      });
      onUpdate(list);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError) {
          onError(wrapped instanceof Error ? wrapped.message : 'Unable to sync threshold rules.');
        }
      }
    }
  );
}

export async function saveThresholdRuleFirestore(
  rule: Omit<ThresholdAlertRule, 'id'> & { id?: string }
): Promise<ThresholdAlertRule> {
  const user = auth.currentUser;
  const id = (rule.id || buildSafeRuleId()).replace(/[^a-zA-Z0-9_-]/g, '');

  if (!user) {
    return { ...rule, id };
  }

  const path = `users/${user.uid}/thresholdRules/${id}`;
  try {
    await setDoc(doc(db, 'users', user.uid, 'thresholdRules', id), {
      userId: user.uid,
      title: rule.title.trim().slice(0, 100),
      ruleType: rule.ruleType,
      checkTime: rule.checkTime.slice(0, 5),
      cityId: rule.cityId.slice(0, 80),
      cityName: rule.cityName.slice(0, 80),
      tempThresholdC: Math.max(-50, Math.min(50, Number(rule.tempThresholdC))),
      rainProbThreshold: Math.max(0, Math.min(100, Math.round(Number(rule.rainProbThreshold)))),
      windThresholdKmh: Math.max(0, Math.min(250, Number(rule.windThresholdKmh))),
      enabled: Boolean(rule.enabled),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { ...rule, id, userId: user.uid };
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function toggleThresholdRuleFirestore(rule: ThresholdAlertRule): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const path = `users/${user.uid}/thresholdRules/${rule.id}`;
  try {
    await updateDoc(doc(db, 'users', user.uid, 'thresholdRules', rule.id), {
      enabled: !rule.enabled,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteThresholdRuleFirestore(ruleId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const path = `users/${user.uid}/thresholdRules/${ruleId}`;
  try {
    await deleteDoc(doc(db, 'users', user.uid, 'thresholdRules', ruleId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function evaluateThresholdRule(
  rule: ThresholdAlertRule,
  bundle: WeatherBundle,
  unit: TemperatureUnit
): ThresholdRuleEvaluation {
  const horizon = bundle.hourly.slice(0, 16);
  const minFeelsC = Math.min(
    bundle.current.apparentTemperatureC,
    ...horizon.map((h) => h.apparentTemperatureC)
  );
  const maxRainProb = Math.max(
    bundle.current.precipitationProbability,
    ...horizon.map((h) => h.precipitationProbability)
  );
  const maxRainMm = Math.max(bundle.current.precipitationMm, ...horizon.map((h) => h.precipitationMm));
  const maxGustKmh = Math.max(bundle.current.windGustsKmh, ...horizon.map((h) => h.windGustsKmh));

  const needJacket = minFeelsC <= rule.tempThresholdC;
  const needUmbrella = maxRainProb >= rule.rainProbThreshold || maxRainMm >= 0.4;

  switch (rule.ruleType) {
    case 'jacket_or_umbrella': {
      if (needJacket && needUmbrella) {
        return {
          triggered: true,
          headline: 'Triggered: Jacket + Umbrella Needed',
          detail: `Feels as cool as ${formatTempWithUnit(minFeelsC, unit)} with ${maxRainProb}% rain chance.`,
        };
      }
      if (needJacket) {
        return {
          triggered: true,
          headline: 'Triggered: Grab a Jacket',
          detail: `Feels-like dips to ${formatTempWithUnit(minFeelsC, unit)} (below ${formatTempWithUnit(rule.tempThresholdC, unit)}).`,
        };
      }
      if (needUmbrella) {
        return {
          triggered: true,
          headline: 'Triggered: Pack an Umbrella',
          detail: `Rain risk peaks at ${maxRainProb}% during the day.`,
        };
      }
      return {
        triggered: false,
        headline: 'Quiet Today: No Jacket or Umbrella Needed',
        detail: `Dry and warmer than ${formatTempWithUnit(rule.tempThresholdC, unit)} — rule stays silent.`,
      };
    }

    case 'jacket':
      return needJacket
        ? {
            triggered: true,
            headline: 'Triggered: Jacket Advised',
            detail: `Wind chill drops to ${formatTempWithUnit(minFeelsC, unit)}.`,
          }
        : {
            triggered: false,
            headline: 'Quiet Today: Warm Enough Without Jacket',
            detail: `Stays above ${formatTempWithUnit(rule.tempThresholdC, unit)}.`,
          };

    case 'umbrella':
      return needUmbrella
        ? {
            triggered: true,
            headline: 'Triggered: Umbrella Needed',
            detail: `Precipitation chance reaches ${maxRainProb}% today.`,
          }
        : {
            triggered: false,
            headline: 'Quiet Today: Dry Horizon',
            detail: `Rain chance stays under ${rule.rainProbThreshold}%.`,
          };

    case 'wind':
      return maxGustKmh >= rule.windThresholdKmh
        ? {
            triggered: true,
            headline: 'Triggered: High Wind Gusts',
            detail: `Gusts reach ${formatWind(maxGustKmh, unit)} (over ${formatWind(rule.windThresholdKmh, unit)}).`,
          }
        : {
            triggered: false,
            headline: 'Quiet Today: Manageable Winds',
            detail: `Peak gusts ${formatWind(maxGustKmh, unit)} stay below your threshold.`,
          };

    case 'freeze':
      return minFeelsC <= rule.tempThresholdC
        ? {
            triggered: true,
            headline: 'Triggered: Freeze Watch',
            detail: `Drops to ${formatTempWithUnit(minFeelsC, unit)} — cover tender plants.`,
          }
        : {
            triggered: false,
            headline: 'Quiet Today: Safe From Freeze',
            detail: `Low stays at ${formatTempWithUnit(minFeelsC, unit)}.`,
          };

    case 'open_windows': {
      const sweetHour = horizon.find(
        (h) =>
          h.temperatureC >= rule.tempThresholdC &&
          h.temperatureC <= 24.5 &&
          h.humidity <= 72 &&
          h.precipitationMm < 0.1 &&
          h.windSpeedKmh <= rule.windThresholdKmh
      );
      return sweetHour
        ? {
            triggered: true,
            headline: 'Triggered: Great Window-Opening Weather',
            detail: `Fresh mild breeze near ${sweetHour.timeIso.slice(11, 16)} (${formatTempWithUnit(sweetHour.temperatureC, unit)}).`,
          }
        : {
            triggered: false,
            headline: 'Quiet Today: Better to Keep Windows Closed',
            detail: 'Outdoor humidity, chill, or gusts outside fresh-air comfort range.',
          };
    }
  }
}
