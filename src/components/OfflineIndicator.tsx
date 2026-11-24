import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-20 left-1/2 -translate-x-1/2 z-50 inline-flex items-center gap-2 rounded-lg bg-amber-950 border border-amber-600 px-3 py-1.5 text-xs font-medium text-amber-100 shadow-lg whitespace-nowrap"
    >
      <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
      <span>Offline Mode · Showing cached forecast</span>
    </div>
  );
}
