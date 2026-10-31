/**
 * Notification Storage Hygiene & Expiration Cleaner Utility
 * Automatically prunes expired or stale notification records from `localStorage`
 * that are older than 7 days (or custom retention duration) to maintain peak application performance.
 */

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000; // 604,800,000 ms
export const DEFAULT_NOTIFICATION_STORAGE_KEY = 'isle_notifications_v2';
export const LEGACY_NOTIFICATION_STORAGE_KEYS = [
  'isle_notifications',
  'isle_notifications_v1',
  'isle_notifs',
  'isle_recent_notifications',
];

export interface StorableNotification {
  id: number;
  createdAt?: number;
  timestamp?: number;
  iconType?: string;
  title: string;
  subtitle: string;
  timeAgo?: string;
  unread?: boolean;
  [key: string]: any;
}

export interface CleanupResult {
  removedCount: number;
  remainingCount: number;
  legacyKeysCleared: number;
}

/**
 * Extracts or infers the creation timestamp of a notification item.
 * Supports explicit `createdAt` / `timestamp` fields, as well as epoch millisecond `id`s.
 */
export function getNotificationTimestamp(item: StorableNotification): number | null {
  if (typeof item.createdAt === 'number' && Number.isFinite(item.createdAt) && item.createdAt > 1000000000000) {
    return item.createdAt;
  }
  if (typeof item.timestamp === 'number' && Number.isFinite(item.timestamp) && item.timestamp > 1000000000000) {
    return item.timestamp;
  }
  // In Isle, notification IDs are generated using Date.now() + Math.floor(Math.random() * 1000)
  if (typeof item.id === 'number' && Number.isFinite(item.id) && item.id > 1600000000000 && item.id < 3000000000000) {
    return item.id;
  }
  return null;
}

/**
 * Checks whether an individual notification is older than the specified max age (default: 7 days).
 */
export function isNotificationExpired(
  item: StorableNotification,
  maxAgeMs: number = SEVEN_DAYS_MS,
  now: number = Date.now()
): boolean {
  if (!item || typeof item !== 'object') return true;
  if (!item.title && !item.subtitle) return true;

  const timestamp = getNotificationTimestamp(item);
  if (timestamp === null) {
    // If no timestamp can be determined, keep recent valid items, discard empty or broken records
    return !item.title;
  }

  return now - timestamp > maxAgeMs;
}

/**
 * Filters an in-memory array of notifications, discarding any items older than maxAgeMs.
 */
export function pruneStaleNotifications<T extends StorableNotification>(
  items: T[],
  maxAgeMs: number = SEVEN_DAYS_MS,
  now: number = Date.now()
): T[] {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => !isNotificationExpired(item, maxAgeMs, now));
}

/**
 * Clears expired or stale notifications older than 7 days from `localStorage`
 * and removes deprecated legacy keys to preserve memory and storage performance.
 */
export function cleanExpiredNotificationsFromStorage(options?: {
  maxAgeMs?: number;
  storageKey?: string;
  now?: number;
}): CleanupResult {
  const result: CleanupResult = {
    removedCount: 0,
    remainingCount: 0,
    legacyKeysCleared: 0,
  };

  if (typeof window === 'undefined' || !window.localStorage) {
    return result;
  }

  const maxAgeMs = options?.maxAgeMs ?? SEVEN_DAYS_MS;
  const storageKey = options?.storageKey ?? DEFAULT_NOTIFICATION_STORAGE_KEY;
  const now = options?.now ?? Date.now();

  // 1. Purge obsolete legacy storage keys
  for (const legacyKey of LEGACY_NOTIFICATION_STORAGE_KEYS) {
    try {
      if (window.localStorage.getItem(legacyKey) !== null) {
        window.localStorage.removeItem(legacyKey);
        result.legacyKeysCleared++;
      }
    } catch {
      // ignore storage access errors
    }
  }

  // 2. Load and inspect active notifications
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return result;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      window.localStorage.removeItem(storageKey);
      result.removedCount = 1;
      return result;
    }

    const totalBefore = parsed.length;
    const freshItems = pruneStaleNotifications(parsed, maxAgeMs, now);
    const removed = totalBefore - freshItems.length;

    result.removedCount = removed;
    result.remainingCount = freshItems.length;

    // Only rewrite to localStorage if items were actually pruned to minimize I/O churn
    if (removed > 0) {
      window.localStorage.setItem(storageKey, JSON.stringify(freshItems));
    }
  } catch (err) {
    // If the JSON in localStorage is corrupted, reset the key to an empty list
    try {
      window.localStorage.setItem(storageKey, JSON.stringify([]));
    } catch {
      // ignore
    }
  }

  return result;
}

/**
 * Automatically initializes recurring notification pruning for the app lifecycle.
 * Runs immediately on invocation, then periodically in the background (default: every 6 hours).
 * Returns an unmount / cancellation cleanup function.
 */
export function initNotificationPruning(options?: {
  intervalMs?: number;
  maxAgeMs?: number;
  storageKey?: string;
  onPruned?: (result: CleanupResult) => void;
}): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const intervalMs = options?.intervalMs ?? 6 * 60 * 60 * 1000; // 6 hours
  const runCleanup = () => {
    try {
      const res = cleanExpiredNotificationsFromStorage({
        maxAgeMs: options?.maxAgeMs,
        storageKey: options?.storageKey,
      });
      if (res.removedCount > 0 && options?.onPruned) {
        options.onPruned(res);
      }
    } catch {
      // ignore
    }
  };

  // Run initial cleanup pass on startup
  runCleanup();

  // Schedule background maintenance interval
  const timerId = window.setInterval(runCleanup, intervalMs);

  return () => {
    window.clearInterval(timerId);
  };
}
