// Line icons drawn in the app's own colours, so nothing borrows the phone's
// emoji set. Every icon takes its colour from `color` and its size from `size`.
import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { c } from './theme';

function Base({ size = 22, color = c.muted2, children }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </Svg>
  );
}

export function IconFind(p) {
  return <Base {...p}><Circle cx={11} cy={11} r={6.5} /><Path d="M16 16l4.5 4.5" /></Base>;
}

export function IconHome(p) {
  return <Base {...p}><Path d="M4 11l8-6.5 8 6.5" /><Path d="M6.5 9.8V20h11V9.8" /></Base>;
}

export function IconOngoing(p) {
  return <Base {...p}><Path d="M4 7h16M4 12h16M4 17h9" /></Base>;
}

export function IconAlerts(p) {
  return <Base {...p}><Path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6z" /><Path d="M10 20h4" /></Base>;
}

export function IconProfile(p) {
  return <Base {...p}><Circle cx={12} cy={8.5} r={3.7} /><Path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" /></Base>;
}

export function IconFolder(p) {
  return <Base {...p}><Path d="M3 7.5A1.5 1.5 0 014.5 6h4L11 8.5h8.5A1.5 1.5 0 0121 10v8a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 18z" /></Base>;
}

export function IconDoc(p) {
  return <Base {...p}><Path d="M14 3H7a1.5 1.5 0 00-1.5 1.5v15A1.5 1.5 0 007 21h10a1.5 1.5 0 001.5-1.5V7.5z" /><Path d="M14 3v4.5h4.5" /></Base>;
}

export function IconChevron(p) {
  return <Base {...p}><Path d="M9 5l7 7-7 7" /></Base>;
}
