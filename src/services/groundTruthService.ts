import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  increment,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';

export type GroundTruthTagType =
  | 'street_flooded'
  | 'bridge_fog'
  | 'black_ice'
  | 'high_crosswind'
  | 'power_out'
  | 'downed_tree'
  | 'hail';

export type GroundTruthSeverity = 'caution' | 'hazard' | 'severe';

export interface GroundTruthTagPreset {
  tagType: GroundTruthTagType;
  label: string;
  shortLabel: string;
  severity: GroundTruthSeverity;
  colorHex: string;
  description: string;
}

export const GROUND_TRUTH_TAGS: GroundTruthTagPreset[] = [
  {
    tagType: 'street_flooded',
    label: 'Street Flooded',
    shortLabel: 'Flooded',
    severity: 'severe',
    colorHex: '#0ea5e9',
    description: 'Standing water across lane or underpass',
  },
  {
    tagType: 'bridge_fog',
    label: 'Dense Fog on Bridge',
    shortLabel: 'Bridge Fog',
    severity: 'hazard',
    colorHex: '#94a3b8',
    description: 'Sudden low visibility on bridge or ridge',
  },
  {
    tagType: 'black_ice',
    label: 'Black Ice / Slick Road',
    shortLabel: 'Black Ice',
    severity: 'severe',
    colorHex: '#38bdf8',
    description: 'Freezing glaze on pavement or overpass',
  },
  {
    tagType: 'high_crosswind',
    label: 'Dangerous Crosswind',
    shortLabel: 'Crosswind',
    severity: 'hazard',
    colorHex: '#f59e0b',
    description: 'Strong side gusts affecting motorcycles & SUVs',
  },
  {
    tagType: 'power_out',
    label: 'Power Out / Signals Dark',
    shortLabel: 'Power Out',
    severity: 'hazard',
    colorHex: '#eab308',
    description: 'Traffic lights out or localized outage',
  },
  {
    tagType: 'downed_tree',
    label: 'Downed Tree / Debris',
    shortLabel: 'Debris',
    severity: 'severe',
    colorHex: '#ef4444',
    description: 'Branches, rockfall, or blocked lane',
  },
  {
    tagType: 'hail',
    label: 'Hail / Heavy Sleet',
    shortLabel: 'Hail',
    severity: 'caution',
    colorHex: '#a855f7',
    description: 'Accumulating hailstones or sleet pellets',
  },
];

export interface GroundTruthReport {
  id: string;
  tagType: GroundTruthTagType;
  label: string;
  note: string;
  lat: number;
  lng: number;
  roadOrArea: string;
  severity: GroundTruthSeverity;
  status: 'active' | 'resolved';
  authorUid: string;
  authorName: string;
  verificationsCount: number;
  createdAtMs: number;
  updatedAtMs: number;
  expiresAtMs: number;
}

const COLLECTION_PATH = 'groundTruthReports';

function buildSafeReportId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `gt_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

function sanitizeDisplayName(rawName?: string | null): string {
  const cleaned = (rawName || 'Local Observer').trim().slice(0, 48);
  return cleaned.length >= 1 ? cleaned : 'Local Observer';
}

function toEpochMs(val: unknown): number {
  if (val && typeof (val as Timestamp).toMillis === 'function') {
    return (val as Timestamp).toMillis();
  }
  return Date.now();
}

export function subscribeToActiveGroundTruthReports(
  onUpdate: (reports: GroundTruthReport[]) => void,
  onError?: (message: string) => void
): () => void {
  const q = query(collection(db, COLLECTION_PATH), where('status', '==', 'active'), limit(50));

  return onSnapshot(
    q,
    (snapshot) => {
      const now = Date.now();
      const parsed: GroundTruthReport[] = [];

      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        const expiresAtMs = toEpochMs(d.expiresAt);
        if (expiresAtMs <= now) return;

        parsed.push({
          id: docSnap.id,
          tagType: d.tagType as GroundTruthTagType,
          label: String(d.label || ''),
          note: String(d.note || ''),
          lat: Number(d.lat),
          lng: Number(d.lng),
          roadOrArea: String(d.roadOrArea || 'Local Road'),
          severity: (d.severity as GroundTruthSeverity) || 'hazard',
          status: d.status === 'resolved' ? 'resolved' : 'active',
          authorUid: String(d.authorUid || ''),
          authorName: String(d.authorName || 'Observer'),
          verificationsCount: Number(d.verificationsCount || 1),
          createdAtMs: toEpochMs(d.createdAt),
          updatedAtMs: toEpochMs(d.updatedAt),
          expiresAtMs,
        });
      });

      parsed.sort((a, b) => b.createdAtMs - a.createdAtMs);
      onUpdate(parsed);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, COLLECTION_PATH);
      } catch (wrapped) {
        if (onError) {
          onError(wrapped instanceof Error ? wrapped.message : 'Unable to sync ground truth reports.');
        }
      }
    }
  );
}

export async function createGroundTruthReport(input: {
  tagType: GroundTruthTagType;
  note: string;
  lat: number;
  lng: number;
  roadOrArea: string;
}): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Sign in with Google to submit a verified ground-truth report.');
  }

  const preset = GROUND_TRUTH_TAGS.find((t) => t.tagType === input.tagType);
  if (!preset) {
    throw new Error('Unsupported ground-truth condition tag.');
  }

  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) {
    throw new Error('Valid map coordinates are required.');
  }

  const reportId = buildSafeReportId();
  const docPath = `${COLLECTION_PATH}/${reportId}`;
  const label = preset.label.slice(0, 60);
  const note = input.note.trim().slice(0, 180);
  const roadOrArea = (input.roadOrArea.trim() || `${input.lat.toFixed(3)}, ${input.lng.toFixed(3)}`).slice(0, 100);
  const authorName = sanitizeDisplayName(user.displayName);
  const expiresAt = Timestamp.fromMillis(Date.now() + 6 * 60 * 60 * 1000);

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, COLLECTION_PATH, reportId), {
      tagType: preset.tagType,
      label,
      note,
      lat: input.lat,
      lng: input.lng,
      roadOrArea,
      severity: preset.severity,
      status: 'active',
      authorUid: user.uid,
      authorName,
      verificationsCount: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      expiresAt,
    });
    await batch.commit();
    return reportId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, docPath);
  }
}

export async function checkUserVerifiedReport(reportId: string, uid: string): Promise<boolean> {
  const path = `${COLLECTION_PATH}/${reportId}/verifications/${uid}`;
  try {
    const snap = await getDoc(doc(db, COLLECTION_PATH, reportId, 'verifications', uid));
    return snap.exists();
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function verifyGroundTruthReport(reportId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Sign in with Google to verify crowd reports.');
  }

  const reportPath = `${COLLECTION_PATH}/${reportId}`;
  try {
    const verificationRef = doc(db, COLLECTION_PATH, reportId, 'verifications', user.uid);
    const existing = await getDoc(verificationRef);
    if (existing.exists()) {
      throw new Error('You have already verified this report.');
    }

    const batch = writeBatch(db);
    batch.set(verificationRef, {
      uid: user.uid,
      reportId,
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, COLLECTION_PATH, reportId), {
      verificationsCount: increment(1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    if (err instanceof Error && err.message === 'You have already verified this report.') {
      throw err;
    }
    handleFirestoreError(err, OperationType.UPDATE, reportPath);
  }
}

export async function resolveGroundTruthReport(reportId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Sign in with Google to update your report.');
  }

  const reportPath = `${COLLECTION_PATH}/${reportId}`;
  try {
    await updateDoc(doc(db, COLLECTION_PATH, reportId), {
      status: 'resolved',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, reportPath);
  }
}

export async function deleteGroundTruthReport(reportId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Sign in with Google to delete your report.');
  }

  const reportPath = `${COLLECTION_PATH}/${reportId}`;
  try {
    await deleteDoc(doc(db, COLLECTION_PATH, reportId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, reportPath);
  }
}
