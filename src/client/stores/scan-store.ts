import type { GridPosition, ScannerStatus, ScanState, ServerEvent } from '@shared/types';
import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';

interface PhotoPreview {
  position: GridPosition;
  thumbnail: string; // base64
  bounds: { width: number; height: number };
  confidence: number;
}

interface ScanStore {
  state: ScanState;
  socket: Socket | null;
  previews: PhotoPreview[];
  connect: () => void;
  disconnect: () => void;
  startScan: (type: 'front' | 'back') => Promise<void>;
  skipBacks: () => Promise<void>;
  checkScanner: () => Promise<ScannerStatus>;
  clearPreviews: () => void;
  reset: () => void;
}

export const useScanStore = create<ScanStore>((set, get) => ({
  state: { status: 'idle' },
  socket: null,
  previews: [],

  connect: () => {
    const existingSocket = get().socket;
    if (existingSocket?.connected) return;

    const socket = io({
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      // eslint-disable-next-line no-console
      console.log('Connected to server');
    });

    socket.on('disconnect', () => {
      // eslint-disable-next-line no-console
      console.log('Disconnected from server');
    });

    socket.on('scan:progress', (data: ServerEvent & { type: 'scan:progress' }) => {
      set((store) => {
        if (
          store.state.status === 'processing_fronts' ||
          store.state.status === 'processing_backs'
        ) {
          return {
            state: { ...store.state, progress: data.progress },
          };
        }
        return store;
      });
    });

    socket.on('scan:complete', (data: ServerEvent & { type: 'scan:complete' }) => {
      set((store) => {
        if (store.state.status === 'processing_fronts') {
          return {
            state: {
              status: 'ready_for_backs',
              frontScanId: data.scanId,
              photosDetected: data.photos,
            },
          };
        }
        if (store.state.status === 'processing_backs') {
          return {
            state: {
              status: 'complete',
              batchId: data.scanId,
              photosSaved: data.photos,
            },
          };
        }
        return store;
      });
    });

    socket.on('scan:error', (data: ServerEvent & { type: 'scan:error' }) => {
      set({
        state: {
          status: 'error',
          message: data.message,
          recoverable: true,
        },
      });
    });

    socket.on(
      'photos:detected',
      (data: {
        photos: Array<{
          position: GridPosition;
          thumbnail: string;
          bounds: { width: number; height: number };
          confidence: number;
        }>;
      }) => {
        set({ previews: data.photos });
      },
    );

    set({ socket });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null });
    }
  },

  startScan: async (type) => {
    const { socket, state } = get();

    if (!socket?.connected) {
      set({
        state: {
          status: 'error',
          message: 'Not connected to server',
          recoverable: true,
        },
      });
      return;
    }

    // Emit scan:start with appropriate context
    const payload =
      type === 'back' && state.status === 'ready_for_backs'
        ? { scanType: type, frontScanId: state.frontScanId }
        : { scanType: type };

    socket.emit('scan:start', payload);

    // Update local state
    if (type === 'front') {
      set({
        state: {
          status: 'scanning_fronts',
          scanId: 'pending',
        },
      });
    } else if (state.status === 'ready_for_backs') {
      set({
        state: {
          status: 'scanning_backs',
          frontScanId: state.frontScanId,
          backScanId: 'pending',
        },
      });
    }
  },

  skipBacks: async () => {
    const { socket, state } = get();

    if (!socket?.connected) {
      set({
        state: {
          status: 'error',
          message: 'Not connected to server',
          recoverable: true,
        },
      });
      return;
    }

    if (state.status !== 'ready_for_backs') {
      return;
    }

    // Set to saving state while server processes
    set({
      state: {
        status: 'saving',
        batchId: state.frontScanId,
      },
    });

    // Emit skip-backs event
    socket.emit('scan:skip-backs', { frontScanId: state.frontScanId });
  },

  checkScanner: async () => {
    try {
      const response = await fetch('/api/scanner/status');
      if (!response.ok) {
        throw new Error('Failed to fetch scanner status');
      }
      return (await response.json()) as ScannerStatus;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error checking scanner:', error);
      return { available: false };
    }
  },

  clearPreviews: () => {
    set({ previews: [] });
  },

  reset: () => {
    set({ state: { status: 'idle' }, previews: [] });
  },
}));
