// Just the ring-check mark from the Cana Bids logo, on its own, so headers can
// place it beside a screen title (not only beside the "Cana Bids" wordmark).
import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { c } from '../theme';

export default function LogoMark({ size = 30, onDark = false }) {
  const ring = onDark ? '#ffffff' : c.navy;
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Circle cx={20} cy={20} r={15} stroke={ring} strokeWidth={3.4} fill="none" />
      <Path d="M12.5 20.5l5 5L30 12.5" stroke={c.cyan} strokeWidth={3.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
