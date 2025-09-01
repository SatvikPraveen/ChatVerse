// apps/web/src/components/common/ConnectionStatus.tsx
import React from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

export function ConnectionStatus() {
  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <div className="bg-red-50 border-b border-red-200 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <WifiOff className="w-5 h-5 text-red-600" />
          <span className="text-sm font-medium text-red-800">
            Connection lost
          </span>
          <span className="text-sm text-red-700">
            Trying to reconnect...
          </span>
        </div>

        <button
          onClick={handleRetry}
          className="flex items-center gap-1 px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Retry
        </button>
      </div>
    </div>
  );
}
