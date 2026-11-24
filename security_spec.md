# Firestore Security Specification — Habari Weather Ground Truth

## 1. Data Invariants
1. **Identity Integrity**: Every `GroundTruthReport` must set `authorUid == request.auth.uid` on creation, and `authorUid` is immutable forever. No PII (email, phone, street home address) may ever be stored on public report documents.
2. **Temporal Integrity**: `createdAt` and `updatedAt` must equal `request.time` on creation; `updatedAt == request.time` on every update; `expiresAt` must fall between `request.time` and `request.time + duration.value(24, 'h')`.
3. **One-Vote-Per-User Atomicity**: Verifying a report requires simultaneously creating `/groundTruthReports/{reportId}/verifications/{request.auth.uid}` and incrementing `verificationsCount` by exactly `1` on `/groundTruthReports/{reportId}` (`existsAfter` + `getAfter`).
4. **Terminal State Locking**: Once a report transitions to `status == 'resolved'`, no further updates (edits, resolves, or verifications) are permitted.
5. **Query & List Boundary Enforcement**: `allow list` on `/groundTruthReports` strictly enforces `resource.data.status == 'active'`, requiring client queries to filter by active status rather than scraping resolved history.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Identity Spoofing on Create**: `{ authorUid: "victim_uid", ... }` by `attacker_uid` -> `PERMISSION_DENIED`.
2. **Unverified Email Write**: Authenticated token with `email_verified: false` creating a report -> `PERMISSION_DENIED`.
3. **Shadow / Ghost Field Injection**: Valid report payload plus `{ isAdminVerified: true }` -> `PERMISSION_DENIED` (`hasOnly` check).
4. **Inflation Attack on Create**: `{ verificationsCount: 999, status: "active", ... }` -> `PERMISSION_DENIED` (`verificationsCount == 1` enforced).
5. **Timestamp Backdating**: `{ createdAt: "2020-01-01T00:00:00Z" }` -> `PERMISSION_DENIED` (`== request.time` enforced).
6. **ID Poisoning**: Document ID of 200 chars or containing `/../` -> `PERMISSION_DENIED` (`isValidId` check).
7. **Coordinate Out-of-Bounds / Denial-of-Wallet String**: `lat: 145` or `note` > 180 chars -> `PERMISSION_DENIED`.
8. **Orphan Verification Without Increment**: Creating `/verifications/{uid}` without incrementing parent `verificationsCount` in same batch -> `PERMISSION_DENIED` (`getAfter` check).
9. **Vote Inflation Without Verification Doc**: Updating `verificationsCount: existing + 5` without creating `/verifications/{uid}` -> `PERMISSION_DENIED` (`existsAfter` + `+ 1` check).
10. **Double Verification**: Same `uid` creating `/verifications/{uid}` or incrementing `verificationsCount` twice -> `PERMISSION_DENIED` (`!exists(...)` check).
11. **Non-Author Resolve / Delete**: `other_uid` updating `status: 'resolved'` or deleting report owned by `author_uid` -> `PERMISSION_DENIED`.
12. **Post-Resolution Mutability**: Author or verifier updating a report whose `existing().status == 'resolved'` -> `PERMISSION_DENIED` (Terminal State Lock).
