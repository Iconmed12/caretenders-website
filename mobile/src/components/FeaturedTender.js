import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { c } from '../theme';
import { valueCompact, openedDate, deadlineProgress, daysUntil } from '../api';

function shortDate(d) {
  return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase() : '';
}

/**
 * The tender, made to matter. With one contract in the system a list row looks
 * like nothing, so this gives it the whole card: the money in large type and a
 * bar draining from the day it opened to the day it closes.
 *
 * `state` is what the member has already done with it, so the same tender is
 * never paid for twice.
 */
export default function FeaturedTender({ tender, state, onPress, onOpen }) {
  const days = daysUntil(tender.deadline);
  const progress = deadlineProgress(tender);
  const value = valueCompact(tender);
  const urgent = days !== null && days <= 7;

  const cta = state === 'running' || state === 'queued'
    ? { label: 'See progress', quiet: true }
    : state === 'ready'
      ? { label: 'View your bid', quiet: true }
      : { label: 'Generate responses', quiet: false };

  const kicker = state === 'running' || state === 'queued'
    ? 'ALREADY STARTED'
    : state === 'ready'
      ? 'BID READY'
      : 'OPEN NOW';

  return (
    <TouchableOpacity style={s.wrap} activeOpacity={0.92} onPress={onOpen}>
      {/* Soft glow, purely decorative. */}
      <View style={s.glow} pointerEvents="none" />

      <View style={s.top}>
        <Text style={s.kicker}>{kicker}</Text>
        {days !== null && (
          <View style={s.urg}>
            <Text style={[s.urgText, urgent && s.urgTextHot]}>
              {days < 0 ? 'Closed' : days === 0 ? 'Closes today' : days === 1 ? 'Closes tomorrow' : 'Closes in ' + days + ' days'}
            </Text>
          </View>
        )}
      </View>

      {!!value && (
        <>
          <Text style={s.value}>{value}</Text>
          <Text style={s.valueSub}>Contract value</Text>
        </>
      )}

      <Text style={s.title} numberOfLines={3}>{tender.title}</Text>
      {!!(tender.org || tender.organisation) && (
        <Text style={s.org}>{tender.org || tender.organisation}</Text>
      )}

      <View style={s.chips}>
        {!!tender.category && (
          <View style={s.chip}><Text style={s.chipText}>{tender.category}</Text></View>
        )}
        {!!tender.region && (
          <View style={s.chip}><Text style={s.chipText}>{tender.region}</Text></View>
        )}
      </View>

      {progress !== null && (
        <View style={s.countdown}>
          <View style={s.bar}>
            <View style={[s.barFill, { width: Math.round((1 - progress) * 100) + '%' }, urgent && s.barFillHot]} />
          </View>
          <View style={s.barLabels}>
            <Text style={s.barLabel}>OPENED {shortDate(openedDate(tender))}</Text>
            <Text style={s.barLabel}>CLOSES {shortDate(new Date(tender.deadline))}</Text>
          </View>
        </View>
      )}

      <TouchableOpacity
        style={[s.cta, cta.quiet && s.ctaQuiet]}
        activeOpacity={0.85}
        onPress={onPress}
      >
        <Text style={[s.ctaText, cta.quiet && s.ctaTextQuiet]}>{cta.label}</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  wrap: { backgroundColor: '#0e2033', borderRadius: 18, padding: 16, overflow: 'hidden' },
  glow: {
    position: 'absolute', width: 170, height: 170, borderRadius: 85,
    right: -62, top: -70, backgroundColor: 'rgba(0,201,224,0.13)',
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  kicker: { fontSize: 9, fontWeight: '800', letterSpacing: 1.3, color: c.cyan },
  urg: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  urgText: { fontSize: 10, fontWeight: '800', color: '#cfe3ee' },
  urgTextHot: { color: '#ffd0d0' },

  value: { fontSize: 34, fontWeight: '800', color: '#fff', letterSpacing: -1, marginTop: 12, lineHeight: 37 },
  valueSub: { fontSize: 10.5, fontWeight: '600', color: '#8fa7b8', marginTop: 4 },

  title: { fontSize: 15, fontWeight: '700', color: '#fff', lineHeight: 20, marginTop: 14 },
  org: { fontSize: 11.5, color: '#8fa7b8', marginTop: 3 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  chip: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  chipText: { fontSize: 10, fontWeight: '700', color: '#cfe3ee', textTransform: 'capitalize' },

  countdown: { marginTop: 14 },
  bar: { height: 5, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: c.cyan, borderRadius: 3 },
  barFillHot: { backgroundColor: '#ff8b8b' },
  barLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  barLabel: { fontSize: 8.5, fontWeight: '700', color: '#8fa7b8', letterSpacing: 0.3 },

  cta: { backgroundColor: c.cyan, borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 15 },
  ctaQuiet: { backgroundColor: 'rgba(255,255,255,0.12)' },
  ctaText: { fontSize: 13.5, fontWeight: '800', color: '#04303a' },
  ctaTextQuiet: { color: '#fff' },
});
