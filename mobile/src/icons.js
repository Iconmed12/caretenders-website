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

export function IconEye(p) {
  return (
    <Base {...p}>
      <Path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z" />
      <Circle cx={12} cy={12} r={2.9} />
    </Base>
  );
}

export function IconEyeOff(p) {
  return (
    <Base {...p}>
      <Path d="M9.6 6.2A8.9 8.9 0 0112 6c6 0 9.5 6 9.5 6a15.6 15.6 0 01-3.4 4M6.4 8A15.6 15.6 0 002.5 12s3.5 6 9.5 6a8.9 8.9 0 003-.5" />
      <Path d="M10 10a2.9 2.9 0 004 4" />
      <Path d="M3.5 3.5l17 17" />
    </Base>
  );
}

export function IconChevron(p) {
  return <Base {...p}><Path d="M9 5l7 7-7 7" /></Base>;
}

export function IconDots({ size = 22, color = c.muted2 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={5} r={1.7} fill={color} />
      <Circle cx={12} cy={12} r={1.7} fill={color} />
      <Circle cx={12} cy={19} r={1.7} fill={color} />
    </Svg>
  );
}

export function IconSend(p) {
  return <Base {...p}><Path d="M21 3L3 10.5l7 2.6 2.6 7L21 3z" /><Path d="M10 13.1L14.5 8.6" /></Base>;
}

export function IconTeam(p) {
  return (
    <Base {...p}>
      <Circle cx={9} cy={8} r={3.2} />
      <Path d="M3 19c0-3.2 2.7-5 6-5s6 1.8 6 5" />
      <Path d="M16 5.3a3.2 3.2 0 010 5.4" />
      <Path d="M17.5 14c2.2.4 3.5 2 3.5 5" />
    </Base>
  );
}

export function IconHeart(p) {
  return <Base {...p}><Path d="M12 20S4.5 15 4.5 9.7A3.7 3.7 0 0112 8a3.7 3.7 0 017.5 1.7C19.5 15 12 20 12 20z" /></Base>;
}

export function IconBuilding(p) {
  return (
    <Base {...p}>
      <Path d="M5 21V4.5a1 1 0 011-1h7a1 1 0 011 1V21" />
      <Path d="M14 21V9.5h4a1 1 0 011 1V21" />
      <Path d="M3.5 21h17" />
      <Path d="M8 7.5h2M8 11h2M8 14.5h2" />
    </Base>
  );
}

export function IconHardhat(p) {
  return (
    <Base {...p}>
      <Path d="M4 16a8 8 0 0116 0" />
      <Path d="M2.5 16.5h19" />
      <Path d="M10 8.2V6.5a2 2 0 014 0v1.7" />
    </Base>
  );
}

export function IconLaptop(p) {
  return <Base {...p}><Path d="M5.5 6.5h13v9h-13z" /><Path d="M3 18.5h18" /></Base>;
}

export function IconSliders(p) {
  return (
    <Base {...p}>
      <Path d="M4 8h9M17 8h3" /><Circle cx={15} cy={8} r={2.1} />
      <Path d="M4 16h3M11 16h9" /><Circle cx={9} cy={16} r={2.1} />
    </Base>
  );
}

export function IconPlus(p) {
  return <Base {...p}><Path d="M12 5v14M5 12h14" /></Base>;
}

export function IconMore(p) {
  return <Base {...p}><Path d="M4 7h16M4 12h16M4 17h16" /></Base>;
}

export function IconClock(p) {
  return <Base {...p}><Circle cx={12} cy={12} r={8.2} /><Path d="M12 7.8V12l3 2" /></Base>;
}

export function IconPin(p) {
  return <Base {...p}><Path d="M12 21s-6-5.3-6-10a6 6 0 1112 0c0 4.7-6 10-6 10z" /><Circle cx={12} cy={11} r={2.2} /></Base>;
}

export function IconCard(p) {
  return <Base {...p}><Path d="M3.5 6.5h17v11h-17z" /><Path d="M3.5 10h17" /></Base>;
}

export function IconShield(p) {
  return (
    <Base {...p}>
      <Path d="M12 3l7 3v5c0 4.6-3 7.7-7 9-4-1.3-7-4.4-7-9V6z" />
      <Path d="M9.2 12l2 2 3.6-3.8" />
    </Base>
  );
}

export function IconHelp(p) {
  return (
    <Base {...p}>
      <Circle cx={12} cy={12} r={8.3} />
      <Path d="M9.7 9.5a2.4 2.4 0 114 1.8c-.9.6-1.7 1-1.7 2.2" />
      <Path d="M12 16.4v.15" />
    </Base>
  );
}

export function IconBook(p) {
  return (
    <Base {...p}>
      <Path d="M5 5.5A1.5 1.5 0 016.5 4H12v16H6.5A1.5 1.5 0 015 18.5z" />
      <Path d="M12 4h5.5A1.5 1.5 0 0119 5.5v13A1.5 1.5 0 0117.5 20H12" />
    </Base>
  );
}

export function IconSignOut(p) {
  return (
    <Base {...p}>
      <Path d="M15 5H6.5A1.5 1.5 0 005 6.5v11A1.5 1.5 0 006.5 19H15" />
      <Path d="M11.5 12H21" />
      <Path d="M18 9l3 3-3 3" />
    </Base>
  );
}

export function IconBars(p) {
  return <Base {...p}><Path d="M5 20V11M12 20V4M19 20v-6" /><Path d="M3.5 20h17" /></Base>;
}

export function IconReview(p) {
  return (
    <Base {...p}>
      <Path d="M14 3H7a1.5 1.5 0 00-1.5 1.5v15A1.5 1.5 0 007 21h10a1.5 1.5 0 001.5-1.5V7.5z" />
      <Path d="M14 3v4.5h4.5" />
      <Path d="M11.7 11.6l.7 1.5 1.6.2-1.2 1.1.3 1.6-1.4-.8-1.4.8.3-1.6-1.2-1.1 1.6-.2z" />
    </Base>
  );
}

export function IconTrash(p) {
  return (
    <Base {...p}>
      <Path d="M4 7h16" />
      <Path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" />
      <Path d="M6.5 7l1 12.5a1 1 0 001 1h7a1 1 0 001-1L17.5 7" />
      <Path d="M10 11v6M14 11v6" />
    </Base>
  );
}

export function IconSpark(p) {
  return (
    <Base {...p}>
      <Path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6L12 4z" />
    </Base>
  );
}

export function IconMail(p) {
  return <Base {...p}><Path d="M3.5 6.5h17v11h-17z" /><Path d="M4 7l8 5.5L20 7" /></Base>;
}

export function IconLock(p) {
  return (
    <Base {...p}>
      <Path d="M6.5 10.5h11a1 1 0 011 1v7a1 1 0 01-1 1h-11a1 1 0 01-1-1v-7a1 1 0 011-1z" />
      <Path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" />
    </Base>
  );
}

export function IconArrowRight(p) {
  return <Base {...p}><Path d="M4 12h15" /><Path d="M13 6l6 6-6 6" /></Base>;
}

export function IconBank(p) {
  return (
    <Base {...p}>
      <Path d="M4 10l8-5 8 5" />
      <Path d="M4 10.5h16" />
      <Path d="M6 10.5v7M10 10.5v7M14 10.5v7M18 10.5v7" />
      <Path d="M4 19h16" />
    </Base>
  );
}

export function IconLink(p) {
  return (
    <Base {...p}>
      <Path d="M10 13a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1.5 1.5" />
      <Path d="M14 11a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1.5-1.5" />
    </Base>
  );
}
