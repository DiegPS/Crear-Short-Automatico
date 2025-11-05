import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

interface KenBurnsImageProps {
  src: string;
  imageDurationInFrames: number;
  zoomFactor?: number;
  panDirection?: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'center';
  isLandscape?: boolean;
}

export const KenBurnsImage: React.FC<KenBurnsImageProps> = ({
  src,
  imageDurationInFrames,
  zoomFactor = 1.2,
  panDirection = 'center',
  isLandscape = false,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Ensure imageDurationInFrames is at least 1 to avoid division by zero or negative values
  const safeDuration = Math.max(1, imageDurationInFrames);

  const progress = frame / safeDuration;

  const scale = interpolate(progress, [0, 1], [1, zoomFactor]);

  let translateX = 0;
  let translateY = 0;
  
  // Calculate maximum translation to keep the image edges from showing during zoom & pan
  // This considers that the image is scaled up by `scale` and `objectFit: 'cover'` is used.
  // The available "extra" width/height due to zoom is (width * scale - width) or width * (scale - 1).
  // We can pan by at most half of this extra width/height from the center.
  const maxTranslateX = (width * (scale - 1)) / 2;
  const maxTranslateY = (height * (scale - 1)) / 2;

  // Interpolate translation from 0 to max allowable pan based on progress
  if (panDirection === 'topLeft') {
    translateX = interpolate(progress, [0, 1], [0, -maxTranslateX / scale]);
    translateY = interpolate(progress, [0, 1], [0, -maxTranslateY / scale]);
  } else if (panDirection === 'topRight') {
    translateX = interpolate(progress, [0, 1], [0, maxTranslateX / scale]);
    translateY = interpolate(progress, [0, 1], [0, -maxTranslateY / scale]);
  } else if (panDirection === 'bottomLeft') {
    translateX = interpolate(progress, [0, 1], [0, -maxTranslateX / scale]);
    translateY = interpolate(progress, [0, 1], [0, maxTranslateY / scale]);
  } else if (panDirection === 'bottomRight') {
    translateX = interpolate(progress, [0, 1], [0, maxTranslateX / scale]);
    translateY = interpolate(progress, [0, 1], [0, maxTranslateY / scale]);
  }
  // For 'center', translateX and translateY remain 0.

  return (
    <AbsoluteFill style={{ backgroundColor: 'black', overflow: 'hidden' }}>
      <Img
        src={src}
        style={{
          width: '100%',
          height: '100%',
          objectFit: isLandscape ? 'contain' : 'cover',
          transform: `scale(${scale}) translateX(${translateX}px) translateY(${translateY}px)`,
        }}
      />
    </AbsoluteFill>
  );
}; 