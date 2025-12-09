import type { GridPosition } from '@shared/types';
import { useState } from 'react';

interface PhotoPreviewProps {
  photos: Array<{
    position: GridPosition;
    thumbnail: string; // base64
    bounds: { width: number; height: number };
    confidence: number;
  }>;
  onViewFull?: (position: GridPosition) => void;
}

interface PhotoCardProps {
  photo: PhotoPreviewProps['photos'][0] | null;
  position: GridPosition;
  onViewFull?: (position: GridPosition) => void;
}

const getPositionLabel = (position: GridPosition): string => {
  switch (position) {
    case 'top-left':
      return 'Top Left';
    case 'top-right':
      return 'Top Right';
    case 'bottom-left':
      return 'Bottom Left';
    case 'bottom-right':
      return 'Bottom Right';
  }
};

const getConfidenceColor = (confidence: number): string => {
  if (confidence > 75) return 'bg-green-500';
  if (confidence > 50) return 'bg-yellow-500';
  return 'bg-red-500';
};

const getConfidenceTextColor = (confidence: number): string => {
  if (confidence > 75) return 'text-green-700';
  if (confidence > 50) return 'text-yellow-700';
  return 'text-red-700';
};

const PhotoCard = ({ photo, position, onViewFull }: PhotoCardProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);

  const positionLabel = getPositionLabel(position);

  if (!photo) {
    return (
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 aspect-square flex flex-col items-center justify-center bg-gray-50">
        <svg
          className="w-12 h-12 text-gray-400 mb-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <title>No photo</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <p className="text-sm text-gray-500 text-center">{positionLabel}</p>
        <p className="text-xs text-gray-400 mt-1">No photo</p>
      </div>
    );
  }

  const handleClick = () => {
    setShowLightbox(true);
    if (onViewFull) {
      onViewFull(position);
    }
  };

  const handleCloseLightbox = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowLightbox(false);
  };

  return (
    <>
      <button
        className="relative border border-gray-200 rounded-lg overflow-hidden shadow-md hover:shadow-xl transition-shadow cursor-pointer bg-white text-left"
        type="button"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={handleClick}
        aria-label={`View ${positionLabel} photo in full size`}
      >
        {/* Thumbnail Image */}
        <div className="aspect-square relative">
          <img
            src={`data:image/jpeg;base64,${photo.thumbnail}`}
            alt={`${positionLabel}`}
            className="w-full h-full object-cover"
          />

          {/* Hover Overlay with Bounds Info */}
          {isHovered && (
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center transition-opacity">
              <div className="text-white text-center">
                <p className="text-sm font-semibold mb-1">Click to view full size</p>
                <p className="text-xs">
                  {photo.bounds.width} × {photo.bounds.height}px
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Position Label */}
        <div className="absolute top-2 left-2 bg-black bg-opacity-70 text-white px-2 py-1 rounded text-xs font-medium">
          {positionLabel}
        </div>

        {/* Confidence Indicator */}
        <div className="absolute top-2 right-2 flex items-center gap-1">
          <div
            className={`w-3 h-3 rounded-full ${getConfidenceColor(photo.confidence)}`}
            title={`Confidence: ${photo.confidence}%`}
          />
        </div>

        {/* Bottom Info Bar */}
        <div className="p-2 bg-gray-50 border-t border-gray-200">
          <div className="flex justify-between items-center text-xs">
            <span className={`font-semibold ${getConfidenceTextColor(photo.confidence)}`}>
              {photo.confidence}% confidence
            </span>
            <span className="text-gray-500">
              {photo.bounds.width}×{photo.bounds.height}
            </span>
          </div>
        </div>
      </button>

      {/* Lightbox Modal */}
      {showLightbox && (
        <div
          className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center p-4"
          onClick={handleCloseLightbox}
          onKeyDown={(e) => {
            if (e.key === 'Escape') handleCloseLightbox();
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Full size photo view"
        >
          <div className="relative max-w-6xl max-h-full">
            {/* Close Button */}
            <button
              type="button"
              onClick={handleCloseLightbox}
              className="absolute top-4 right-4 text-white bg-black bg-opacity-50 hover:bg-opacity-75 rounded-full p-2 transition-colors z-10"
              aria-label="Close lightbox"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <title>Close</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>

            {/* Full Size Image */}
            <img
              src={`data:image/jpeg;base64,${photo.thumbnail}`}
              alt={`${positionLabel} - full size`}
              className="max-w-full max-h-[90vh] object-contain pointer-events-none"
            />

            {/* Image Info */}
            <div className="absolute bottom-4 left-4 right-4 bg-black bg-opacity-75 text-white p-4 rounded">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold">{positionLabel}</p>
                  <p className="text-sm text-gray-300">
                    {photo.bounds.width} × {photo.bounds.height}px
                  </p>
                </div>
                <div
                  className={`text-right ${getConfidenceTextColor(photo.confidence)} bg-white px-3 py-1 rounded`}
                >
                  <p className="text-sm font-bold">{photo.confidence}%</p>
                  <p className="text-xs">confidence</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const PhotoPreview = ({ photos, onViewFull }: PhotoPreviewProps) => {
  // Create a map of position to photo for easy lookup
  const photoMap = new Map(photos.map((p) => [p.position, p]));

  const positions: GridPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

  return (
    <div className="w-full">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Detected Photos</h2>
        <p className="text-sm text-gray-600">
          {photos.length} {photos.length === 1 ? 'photo' : 'photos'} detected - Click to view full
          size
        </p>
      </div>

      {/* Grid Layout - 2x2 on desktop, stack on mobile */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {positions.map((position) => (
          <PhotoCard
            key={position}
            photo={photoMap.get(position) ?? null}
            position={position}
            {...(onViewFull ? { onViewFull } : {})}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-xs font-semibold text-gray-700 mb-2">Confidence Score:</p>
        <div className="flex flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-gray-600">&gt; 75% (Excellent)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <span className="text-gray-600">&gt; 50% (Good)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-gray-600">&lt; 50% (Uncertain)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
