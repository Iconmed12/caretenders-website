import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { c, t } from '../theme';
import { valueCompact, daysUntil, fetchOngoing, jobState } from '../api';
import { useAuth } from '../auth';
import { IconBars, IconClock, IconShield, IconPin } from '../icons';

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
  const token = (session && session.access_token) || '';
  // We block a NEW run only while one is actively running. A finished bid does
  // not stop them generating again (e.g. a fresh version later).
  const [mine, setMine] = useState([]);
  // Stays false until the first check returns, so the footer shows a spinner
  // rather than flashing the wrong button. It is not reset on later focuses.
  const [checked, setChecked] = useState(false);

  useFocusEffect(useCallback(() => {
    let alive = true;
    fetchOngoing(token)
      .then((jobs) => {
        if (!alive) return;
        setMine(jobs.filter((j) => j.tender_id === tender.id));
        setChecked(true);
      })
      .catch(() => { if (alive) { setMine([]); setChecked(true); } });
    return () => { alive = false; };
  }, [token, tender.id]));

  const runningJob = mine.find((j) => ['running', 'queued'].includes(jobState(j)));
  const completedJob = mine.find((j) => jobState(j) === 'ready');

  function seeProgress() { navigation.getParent()?.navigate('Ongoing'); }
  function viewBid() { navigation.navigate('BidReady', { tender }); }
  function generate() { navigation.navigate('Generating', { tender }); }

  const days = daysUntil(tender.deadline);
  const closesValue = days == null ? '—' : days < 0 ? 'Closed' : days === 0 ? 'Today' : days + (days === 1 ? ' day' : ' days');
  const meta = [
    { Icon: IconBars, value: valueCompact(tender) || 'N/A', label: 'Contract value' },
    { Icon: IconClock, value: closesValue, label: 'Until close', urgent: days != null && days >= 0 && days <= 7 },
    { Icon: IconShield, value: tender.is_non_cqc ? 'Open' : 'Required', label: tender.is_non_cqc ? 'New providers' : 'CQC status' },
    { Icon: IconPin, value: tender.region || 'UK', label: 'Region' },
  ];

  return (
    <View style={s.wrap}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>{tender.title}</Text>
        <Text style={s.org}>{[tender.org || tender.organisation, tender.region].filter(Boolean).join(' · ')}</Text>

        <View style={s.metaGrid}>
          {meta.map((m) => (
            <View key={m.label} style={s.metaCell}>
              <m.Icon size={18} color={c.navy} />
              <Text style={[s.metaValue, m.urgent && { color: c.amber }]}>{m.value}</Text>
              <Text style={s.metaLabel}>{m.label}</Text>
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
        {!checked ? (
          <View style={[s.cta, s.ctaQuiet]}><ActivityIndicator color={c.teal} /></View>
        ) : runningJob ? (
          <>
            <TouchableOpacity style={[s.cta, s.ctaQuiet]} activeOpacity={0.85} onPress={seeProgress}>
              <Text style={[s.ctaText, s.ctaQuietText]}>Being written, see progress</Text>
            </TouchableOpacity>
            <Text style={s.ctaNote}>This tender is currently being generated. We will email you when it is ready.</Text>
          </>
        ) : completedJob ? (
          <>
            <View style={s.btnRow}>
              <TouchableOpacity style={[s.cta, s.ctaQuiet, s.half]} activeOpacity={0.85} onPress={viewBid}>
                <Text style={[s.ctaText, s.ctaQuietText]}>View your bid</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.cta, s.half]} activeOpacity={0.85} onPress={generate}>
                <Text style={s.ctaText}>Generate</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.ctaNote}>You have already generated a bid. You can generate a fresh one any time.</Text>
          </>
        ) : (
          <TouchableOpacity style={s.cta} activeOpacity={0.85} onPress={generate}>
            <Text style={s.ctaText}>Generate responses</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.white },
  title: { fontSize: 25, fontWeight: '800', color: c.navy, lineHeight: 31, letterSpacing: -0.4 },
  org: { fontSize: 13.5, color: c.muted, marginTop: 6 },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  metaCell: { flexGrow: 1, flexBasis: '46%', backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 14, gap: 7 },
  metaValue: { fontSize: 19, fontWeight: '800', color: c.navy },
  metaLabel: { fontSize: 11.5, fontWeight: '600', color: c.muted2 },
  secTitle: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.8, color: c.muted2, marginTop: 22, marginBottom: 8 },
  about: { ...t.body, color: c.muted, lineHeight: 21 },
  qRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: c.line2 },
  qNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' },
  qNumText: { fontSize: 11, fontWeight: '800', color: c.muted },
  qText: { fontSize: 14, color: c.ink, flex: 1 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: c.line2, backgroundColor: c.white },
  cta: { backgroundColor: c.brand, borderRadius: 13, paddingVertical: 16, alignItems: 'center' },
  ctaText: { fontSize: 15, fontWeight: '700', color: '#04303a' },
  ctaQuiet: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line },
  ctaQuietText: { color: c.navy },
  ctaNote: { fontSize: 11.5, color: c.muted2, textAlign: 'center', marginTop: 9 },
  btnRow: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
});
