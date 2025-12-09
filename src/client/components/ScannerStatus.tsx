import type { ScannerStatus as ScannerStatusType } from '@shared/types';
import { useCallback, useEffect, useState } from 'react';

export const ScannerStatus = () => {
  const [status, setStatus] = useState<ScannerStatusType | null>(null);
  const [loading, setLoading] = useState(true);

  const checkStatus = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/scanner/status');
      const data = (await response.json()) as ScannerStatusType;
      setStatus(data);
    } catch {
      setStatus({ available: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();

    // Poll every 5 seconds
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  if (loading && !status) {
    return (
      <div className="bg-white rounded-lg shadow p-4" aria-busy="true">
        <div className="flex items-center justify-center gap-2">
          <div
            className="w-4 h-4 border-2 border-gray-300 border-t-primary-600 rounded-full animate-spin"
            aria-hidden="true"
          />
          <p className="text-gray-500">Checking scanner...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="scanner-status"
      className={`rounded-lg shadow p-4 ${
        status?.available
          ? 'bg-green-50 border border-green-200'
          : 'bg-yellow-50 border border-yellow-200'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`w-3 h-3 rounded-full ${
              status?.available ? 'bg-green-500' : 'bg-yellow-500'
            } ${loading ? 'animate-pulse' : ''}`}
            aria-hidden="true"
          />
          <span
            className={`font-medium ${status?.available ? 'text-green-700' : 'text-yellow-700'}`}
          >
            {status?.available ? 'Scanner Connected' : 'Scanner Not Found'}
          </span>
        </div>
        <button
          type="button"
          onClick={checkStatus}
          disabled={loading}
          aria-label="Refresh scanner status"
          className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-touch"
        >
          {loading ? 'Checking...' : 'Refresh'}
        </button>
      </div>
      {status?.available && (
        <div className="mt-2 text-sm text-gray-600 space-y-1">
          {status.model && (
            <p className="flex items-center gap-2">
              <span className="font-medium">Model:</span>
              <span>{status.model}</span>
            </p>
          )}
          {status.ip && (
            <p className="flex items-center gap-2">
              <span className="font-medium">IP:</span>
              <span className="font-mono text-xs">{status.ip}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
};
