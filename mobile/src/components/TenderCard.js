import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { c } from '../theme';
import { sectorOf, valueLabel, daysUntil } from '../api';
import { IconHeart, IconBuilding, IconTeam, IconHardhat, IconLaptop, IconDoc, IconPin, IconChevron } from '../icons';

// Without onPress the card renders as a plain, non-tappable panel (no chevron),
// used on the Generate screen to show the tender being worked on.

// The right icon for each sector thumbnail.
const SECTOR_ICON = {
  care: IconHeart,
  facilities: IconBuilding,
  recruitment: IconTeam,
  construction: IconHardhat,
  it: IconLaptop,
  other: IconDoc,
};

function closesLabel(t) {
  const d = daysUntil(t.deadline);
  if (d === null) return null;
  if (d < 0) return { text: 'Closed', tone: 'grey' };
  if (d === 0) return { text: 'Closes today', tone: 'red' };
  if (d === 1) return { text: 'Closes in 1 day', tone: 'red' };
  return { text: 'Closes in ' + d + ' days', tone: d <= 7 ? 'red' : 'amber' };
}

/**
 * One tender, as it appears on Home and Opportunities. A sector-coloured icon
 * thumbnail stands in for a photo (we have no per-tender images), then the
 * sector tag, closing countdown, title, buyer, value and location, all real.
 */
export default function TenderCard({ tender, onPress }) {
  const sector = sectorOf(tender);
  const Icon = SECTOR_ICON[sector.key] || IconDoc;
  const closes = closesLabel(tender);
  const value = valueLabel(tender);
  const region = tender.region || tender.location || '';
  const Container = onPress ? TouchableOpacity : View;
  const containerProps = onPress ? { activeOpacity: 0.85, onPress } : {};

  return (
    <Container style={s.card} {...containerProps}>
      <View style={[s.thumb, { backgroundColor: sector.bg }]}>
        <Icon size={26} color={sector.color} />
      </View>

      <View style={s.body}>
        <View style={s.topRow}>
          <View style={[s.tag, { backgroundColor: sector.bg }]}>
            <Text style={[s.tagText, { color: sector.color }]} numberOfLines={1}>{sector.tag}</Text>
          </View>
          {closes && (
            <View style={[s.pill, closes.tone === 'red' ? s.pillRed : closes.tone === 'amber' ? s.pillAmber : s.pillGrey]}>
              <Text style={[s.pillText, closes.tone === 'red' ? s.pillRedText : closes.tone === 'amber' ? s.pillAmberText : s.pillGreyText]}>
                {closes.text}
              </Text>
            </View>
          )}
        </View>

        <Text style={s.title} numberOfLines={2}>{tender.title}</Text>
        {!!(tender.org || tender.organisation) && (
          <Text style={s.org} numberOfLines={1}>{tender.org || tender.organisation}</Text>
        )}

        <View style={s.foot}>
          {!!value && (
            <View style={s.footItem}>
              <IconDoc size={13} color={c.muted2} />
              <Text style={s.footText}>{value}</Text>
            </View>
          )}
          {!!region && (
            <View style={s.footItem}>
              <IconPin size={13} color={c.muted2} />
              <Text style={s.footText} numberOfLines={1}>{region}</Text>
            </View>
          )}
        </View>
      </View>

      {onPress && <IconChevron size={16} color={c.muted2} />}
    </Container>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 15, padding: 12, marginBottom: 11 },
  thumb: { width: 64, height: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  tag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 1 },
  tagText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 9.5, fontWeight: '800' },
  pillRed: { backgroundColor: '#fdecec' }, pillRedText: { color: '#d64545' },
  pillAmber: { backgroundColor: '#fdf3e2' }, pillAmberText: { color: '#b7791f' },
  pillGrey: { backgroundColor: c.line }, pillGreyText: { color: c.muted },
  title: { fontSize: 14.5, fontWeight: '800', color: c.navy, lineHeight: 19, marginTop: 6 },
  org: { fontSize: 12, color: c.muted, marginTop: 2 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 },
  footItem: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  footText: { fontSize: 11.5, color: c.muted2, fontWeight: '600' },
});
