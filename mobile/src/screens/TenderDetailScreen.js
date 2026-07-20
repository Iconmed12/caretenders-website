import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { c, t } from '../theme';
import { closingLabel, valueLabel, fetchOngoing, jobState } from '../api';
import { useAuth } from '../auth';

// Placeholder question set. Once the tender's own questions are stored against
// the record, this reads them from the tender instead.
const FALLBACK_QUESTIONS = [
  'Person-centred care',
  'Safeguarding',
  'Workforce & retention',
  'Mobilisation',
  'Quality assurance',
  'Social value',
];

export default function TenderDetailScreen({ route, navigation }) {
  const tender = (route.params && route.params.tender) || {};
  const questions = Array.isArray(tender.questions) && tender.questions.length
    ? tender.questions
    : FALLBACK_QUESTIONS;

  const { session } = useAuth();
  const email = (session && session.user && session.user.email) || '';
  // If this tender has already been started, the button takes them to it
  // instead of paying to write the same bid twice.
  const [existing, setExisting] = useState(null);

  useFocusEffect(useCallback(() => {
    let alive = true;
    fetchOngoing(email)
      .then((jobs) => {
        if (!alive) return;
        const mine = jobs.filter((j) => j.tender_id === tender.id);
        setExisting(mine.length ? mine[0] : null);
      })
      .catch(() => { if (alive) setExisting(null); });
    return () => { alive = false; };
  }, [email, tender.id]));

  const state = existing ? jobState(existing) : null;
  const alreadyRunning = state === 'running' || state === 'queued';
  const alreadyDone = state === 'ready';

  function onPress() {
    if (alreadyRunning) {
      navigation.getParent()?.navigate('Ongoing');
      return;
    }
    if (alreadyDone) {
      navigation.navigate('BidReady', { tender });
      return;
    }
    navigation.navigate('Generating', { tender, questions });
  }

  const ctaText = alreadyRunning
    ? 'Already writing, see progress'
    : alreadyDone
      ? 'View your bid'
      : 'Generate responses';

  const meta = [
    { label: 'Value', value: valueLabel(tender) || 'Not stated' },
    { label: 'Closes', value: closingLabel(tender) || 'Not stated' },
    { label: 'CQC', value: tender.is_non_cqc ? 'Open to new providers' : 'Required' },
    { label: 'Region', value: tender.region || 'UK' },
  ];

  return (
    <View style={s.wrap}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>{tender.title}</Text>
        <Text style={s.org}>{[tender.org || tender.organisation, tender.region].filter(Boolean).join(' · ')}</Text>

        <View style={s.metaGrid}>
          {meta.map((m) => (
            <View key={m.label} style={s.metaCell}>
              <Text style={s.metaLabel}>{m.label.toUpperCase()}</Text>
              <Text style={s.metaValue}>{m.value}</Text>
            </View>
          ))}
        </View>

        {!!tender.description && (
          <>
            <Text style={s.secTitle}>ABOUT THIS TENDER</Text>
            <Text style={s.about}>{tender.description}</Text>
          </>
        )}

        <Text style={s.secTitle}>{questions.length} QUESTIONS LOADED</Text>
        {questions.map((q, i) => (
          <View key={i} style={s.qRow}>
            <View style={s.qNum}><Text style={s.qNumText}>{i + 1}</Text></View>
            <Text style={s.qText}>{typeof q === 'string' ? q : q.title || q.question}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity
          style={[s.cta, (alreadyRunning || alreadyDone) && s.ctaQuiet]}
          activeOpacity={0.85}
          onPress={onPress}
        >
          <Text style={[s.ctaText, (alreadyRunning || alreadyDone) && s.ctaQuietText]}>
            {ctaText}
          </Text>
        </TouchableOpacity>
        {alreadyDone && (
          <Text style={s.ctaNote}>You have already generated a bid for this tender.</Text>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.white },
  title: { fontSize: 21, fontWeight: '700', color: c.navy, lineHeight: 27 },
  org: { fontSize: 13, color: c.muted2, marginTop: 5 },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  metaCell: { flexGrow: 1, flexBasis: '46%', backgroundColor: c.bg, borderRadius: 11, padding: 11 },
  metaLabel: { fontSize: 9.5, fontWeight: '700', letterSpacing: 0.5, color: c.muted2 },
  metaValue: { fontSize: 14, fontWeight: '700', color: c.navy, marginTop: 3 },
  secTitle: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.8, color: c.muted2, marginTop: 22, marginBottom: 8 },
  about: { ...t.body, color: c.muted, lineHeight: 21 },
  qRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: c.line2 },
  qNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' },
  qNumText: { fontSize: 11, fontWeight: '800', color: c.muted },
  qText: { fontSize: 14, color: c.ink, flex: 1 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: c.line2, backgroundColor: c.white },
  cta: { backgroundColor: c.cyan, borderRadius: 13, paddingVertical: 16, alignItems: 'center' },
  ctaText: { fontSize: 15, fontWeight: '700', color: '#04303a' },
  ctaQuiet: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line },
  ctaQuietText: { color: c.navy },
  ctaNote: { fontSize: 11.5, color: c.muted2, textAlign: 'center', marginTop: 9 },
});
