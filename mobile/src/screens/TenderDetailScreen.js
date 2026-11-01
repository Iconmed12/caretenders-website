import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { c, t } from '../theme';
import { valueCompact, daysUntil, fetchOngoing, jobState, fetchReviewAllowance, requestReview } from '../api';
import { useAuth } from '../auth';
import { IconBars, IconClock, IconShield, IconPin } from '../icons';

const REVIEW_OPTIONS = [
  { key: 'full', title: 'Full tender review', body: 'A Cana expert reviews your whole bid.' },
  { key: 'response', title: 'Response review', body: 'An expert reviews a specific response or section.' },
];

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
  const [allowance, setAllowance] = useState(null);
  const [review, setReview] = useState(null); // 'response' | 'full' | null
  const [showGen, setShowGen] = useState(false); // the confirm sheet
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
    fetchReviewAllowance(token).then((a) => { if (alive) setAllowance(a); });
    return () => { alive = false; };
  }, [token, tender.id]));

  const runningJob = mine.find((j) => ['running', 'queued'].includes(jobState(j)));
  const completedJob = mine.find((j) => jobState(j) === 'ready');

  function seeProgress() { navigation.getParent()?.navigate('Ongoing'); }
  function viewBid() { navigation.navigate('BidReady', { tender }); }
  // Tapping Generate opens the confirm sheet; nothing runs until "Generate now".
  function openGenerate() { setShowGen(true); }
  // Covered = this review is in the plan and still has allowance left this month,
  // so it is free. Otherwise it is a paid request: we log it and charge the card
  // on file in the background (no price or payment shown in the app, so Apple has
  // nothing to flag), then generate the bid regardless so the member is never
  // blocked. The price and the charge live on the website invoices page.
  function reviewCovered(type) {
    const box = type && allowance && allowance[type];
    return !!(box && box.limit > 0 && box.remaining > 0);
  }
  function confirmGenerate() {
    setShowGen(false);
    const type = review;
    const covered = reviewCovered(type);
    const requested = !!type && !covered;
    if (requested) {
      // Fire and forget: the invoices page and the team email are the record of
      // this, so we do not block generation on the charge.
      requestReview(token, { review_type: type, tender_id: tender.id, tender_title: tender.title }).catch(() => {});
    }
    navigation.navigate('Generating', {
      tender,
      includedReview: covered ? type : null,
      requestedReview: requested ? type : null,
    });
  }

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
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
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
              <TouchableOpacity style={[s.cta, s.half]} activeOpacity={0.85} onPress={openGenerate}>
                <Text style={s.ctaText}>Generate</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.ctaNote}>You have already generated a bid. You can generate a fresh one any time.</Text>
          </>
        ) : (
          <TouchableOpacity style={s.cta} activeOpacity={0.85} onPress={openGenerate}>
            <Text style={s.ctaText}>Generate responses</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Confirm sheet: choose a review (or none), then confirm. Nothing runs
          until "Generate now". */}
      <Modal visible={showGen} transparent animationType="slide" onRequestClose={() => setShowGen(false)}>
        <View style={s.sheetOverlay}>
          <TouchableOpacity style={s.sheetBackdrop} activeOpacity={1} onPress={() => setShowGen(false)} />
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Generate response</Text>
            <Text style={s.sheetSub}>Add an expert review if you want one, then confirm.</Text>

            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              <TouchableOpacity style={[s.revRow, review === null && s.revRowOn]} activeOpacity={0.85} onPress={() => setReview(null)}>
                <View style={[s.radio, review === null && s.radioOn]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.revTitle}>No review</Text>
                  <Text style={s.revBody}>Generate the bid on its own.</Text>
                </View>
              </TouchableOpacity>

              {REVIEW_OPTIONS.map((opt) => {
                const box = allowance && allowance[opt.key];
                const included = !!(box && box.limit > 0);
                const remaining = box ? box.remaining : 0;
                const available = included && remaining > 0;
                const selected = review === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[s.revRow, selected && s.revRowOn]}
                    activeOpacity={0.85}
                    onPress={() => setReview(opt.key)}
                  >
                    <View style={[s.radio, selected && s.radioOn]} />
                    <View style={{ flex: 1 }}>
                      <View style={s.revHead}>
                        <Text style={s.revTitle}>{opt.title}</Text>
                        {available
                          ? <View style={s.revBadge}><Text style={s.revBadgeText}>{remaining} left this month</Text></View>
                          : <View style={s.revBadgeReq}><Text style={s.revBadgeReqText}>Request</Text></View>}
                      </View>
                      <Text style={s.revBody}>
                        {opt.body}{available ? '' : ' We will confirm the cost before we start.'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity style={[s.cta, { marginTop: 14 }]} activeOpacity={0.85} onPress={confirmGenerate}>
              <Text style={s.ctaText}>Generate now</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.sheetCancel} activeOpacity={0.7} onPress={() => setShowGen(false)}>
              <Text style={s.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.white },
  title: { fontSize: 28, fontWeight: '800', color: c.navy, lineHeight: 34, letterSpacing: -0.4 },
  org: { fontSize: 14, color: c.muted, marginTop: 6 },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  metaCell: { flexGrow: 1, flexBasis: '46%', backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 14, padding: 15, gap: 7 },
  metaValue: { fontSize: 20, fontWeight: '800', color: c.navy },
  metaLabel: { fontSize: 11.5, fontWeight: '600', color: c.muted2 },
  secTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: c.muted2, marginTop: 22, marginBottom: 8 },
  about: { ...t.body, color: c.muted, lineHeight: 21 },
  qRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line2 },
  qNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' },
  qNumText: { fontSize: 11, fontWeight: '800', color: c.muted },
  qText: { fontSize: 15, color: c.ink, flex: 1 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: c.line2, backgroundColor: c.white },
  cta: { backgroundColor: c.brand, borderRadius: 15, paddingVertical: 16, alignItems: 'center' },
  ctaText: { fontSize: 17, fontWeight: '700', color: '#ffffff' },
  ctaQuiet: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line },
  ctaQuietText: { color: c.navy },
  ctaNote: { fontSize: 11.5, color: c.muted2, textAlign: 'center', marginTop: 9 },
  btnRow: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  reviewBlock: { marginTop: 4 },
  reviewIntro: { fontSize: 13.5, color: c.muted, marginTop: -2, marginBottom: 12, lineHeight: 19 },
  revRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, borderWidth: 1, borderColor: c.line, borderRadius: 14, padding: 15, marginBottom: 10 },
  revRowOn: { borderColor: c.teal, backgroundColor: '#F5FDFE' },
  revRowOff: { opacity: 0.75 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#C9D2DA', marginTop: 1 },
  radioOn: { borderColor: c.teal, borderWidth: 6 },
  revHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  revTitle: { fontSize: 15.5, fontWeight: '700', color: c.navy, flexShrink: 1 },
  revBody: { fontSize: 13, color: c.muted, marginTop: 3, lineHeight: 18 },
  revBadge: { backgroundColor: c.goodBg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  revBadgeText: { fontSize: 10, fontWeight: '800', color: c.good },
  revBadgeReq: { backgroundColor: c.tealBg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  revBadgeReqText: { fontSize: 10, fontWeight: '800', color: c.teal },

  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,26,47,0.5)' },
  sheet: { backgroundColor: c.white, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 28 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.line, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: c.navy, letterSpacing: -0.4 },
  sheetSub: { fontSize: 13.5, color: c.muted, marginTop: 4, marginBottom: 14, lineHeight: 19 },
  sheetCancel: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  sheetCancelText: { fontSize: 14, fontWeight: '700', color: c.muted },
});
