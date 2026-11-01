import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { c } from '../theme';
import { useAuth } from '../auth';
import { fetchCharges, requestReview, fetchOngoing, jobState, orderRef } from '../api';
import { IconReview, IconDoc, IconChevron } from '../icons';

function money(p) { if (p == null) return ''; const v = p / 100; return '£' + (v % 1 === 0 ? String(v) : v.toFixed(2)); }

export default function ReviewsScreen() {
  const { session } = useAuth();
  const token = (session && session.access_token) || '';

  const [data, setData] = useState(null);     // { charges, outstanding, prices }
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pick, setPick] = useState(null);     // the bid chosen for a new review
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    let alive = true;
    Promise.all([fetchCharges(token), fetchOngoing(token).catch(() => [])]).then(([d, j]) => {
      if (!alive) return;
      setData(d);
      setBids((j || []).filter((x) => jobState(x) === 'ready'));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [token]);

  useFocusEffect(load);

  async function doRequest(type) {
    if (!pick) return;
    setBusy(true);
    try {
      const res = await requestReview(token, { review_type: type, tender_id: pick.tender_id, tender_title: pick.tender_title });
      setPick(null);
      Alert.alert(res.status === 'paid' ? 'Review requested' : 'We will be in touch', res.message || '');
      load();
    } catch (e) {
      Alert.alert('Could not request', e.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <View style={s.centre}><ActivityIndicator color={c.teal} /></View>;

  const prices = (data && data.prices) || { response: 0, full: 0 };
  const charges = (data && data.charges) || [];
  const outstanding = (data && data.outstanding) || 0;

  const pill = (status) => {
    if (status === 'paid') return <View style={[s.pill, s.pillPaid]}><Text style={[s.pillT, s.pillPaidT]}>Paid</Text></View>;
    if (status === 'failed') return <View style={[s.pill, s.pillFail]}><Text style={[s.pillT, s.pillFailT]}>Payment issue</Text></View>;
    return <View style={[s.pill, s.pillPend]}><Text style={[s.pillT, s.pillPendT]}>Pending</Text></View>;
  };

  return (
    <ScrollView style={s.wrap} contentContainerStyle={{ padding: 18, paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
      <Text style={s.h1}>Reviews &amp; account</Text>
      <Text style={s.sub}>Request an expert review beyond your included allowance. We charge the card on file and start once it clears.</Text>

      <View style={s.owe}>
        <Text style={s.oweT}>OUTSTANDING</Text>
        <Text style={s.oweN}>{money(outstanding)}</Text>
        <Text style={s.oweD}>Charged automatically to your card on file. See itemised invoices on getcana.co.uk.</Text>
      </View>

      <Text style={s.lab}>REQUEST A REVIEW</Text>
      {bids.length === 0 ? (
        <View style={s.card}><Text style={s.empty}>Generate a bid first, then you can request a review of it here.</Text></View>
      ) : (
        bids.map((b) => (
          <TouchableOpacity key={String(b.id)} style={s.bidRow} activeOpacity={0.85} onPress={() => setPick(b)}>
            <View style={s.bidIcon}><IconDoc size={18} color={c.navy} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.bidTitle} numberOfLines={2}>{b.tender_title}</Text>
              <Text style={s.bidMeta}>{orderRef(b)}{b.org ? '  ·  ' + b.org : ''}</Text>
            </View>
            <IconChevron size={16} color={c.muted2} />
          </TouchableOpacity>
        ))
      )}

      {charges.length > 0 && (
        <>
          <Text style={s.lab}>RECENT</Text>
          {charges.map((r) => (
            <View key={String(r.id)} style={s.chargeRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.chargeTitle}>{r.review_type === 'full' ? 'Full Tender Review' : 'Response Review'}</Text>
                <Text style={s.chargeMeta} numberOfLines={1}>{r.tender_title || ''}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={s.chargeAmt}>{money(r.amount)}</Text>
                {pill(r.status)}
              </View>
            </View>
          ))}
        </>
      )}

      {/* Choose review type for the picked bid */}
      <Modal visible={!!pick} transparent animationType="slide" onRequestClose={() => setPick(null)}>
        <View style={s.sheetOverlay}>
          <TouchableOpacity style={s.sheetBackdrop} activeOpacity={1} onPress={() => !busy && setPick(null)} />
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Request a review</Text>
            <Text style={s.sheetSub} numberOfLines={2}>{pick ? pick.tender_title : ''}</Text>

            <TouchableOpacity style={s.opt} activeOpacity={0.85} disabled={busy} onPress={() => doRequest('response')}>
              <View style={s.optIcon}><IconReview size={19} color={c.navy} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.optTitle}>Response Review</Text>
                <Text style={s.optBody}>A review of a generated response.</Text>
              </View>
              <Text style={s.optPrice}>{money(prices.response)}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.opt} activeOpacity={0.85} disabled={busy} onPress={() => doRequest('full')}>
              <View style={s.optIcon}><IconReview size={19} color={c.navy} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.optTitle}>Full Tender Review</Text>
                <Text style={s.optBody}>A complete review of your bid.</Text>
              </View>
              <Text style={s.optPrice}>{money(prices.full)}</Text>
            </TouchableOpacity>

            <Text style={s.sheetNote}>Charged to your card on file. We start the review once payment clears. No payment is taken in the app.</Text>
            {busy ? <ActivityIndicator color={c.teal} style={{ marginTop: 12 }} /> : (
              <TouchableOpacity onPress={() => setPick(null)}><Text style={s.sheetCancel}>Cancel</Text></TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg },
  h1: { fontSize: 24, fontWeight: '800', color: c.navy, letterSpacing: -0.4 },
  sub: { fontSize: 13.5, color: c.muted, marginTop: 6, lineHeight: 19 },

  owe: { backgroundColor: c.navy, borderRadius: 16, padding: 16, marginTop: 16 },
  oweT: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, color: '#9AA7B3' },
  oweN: { fontSize: 27, fontWeight: '800', color: '#fff', marginTop: 2 },
  oweD: { fontSize: 11.5, color: '#9AA7B3', marginTop: 6, lineHeight: 16 },

  lab: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, color: c.muted2, marginTop: 24, marginBottom: 10 },
  card: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 15, padding: 16 },
  empty: { fontSize: 13, color: c.muted, lineHeight: 19 },

  bidRow: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 15, padding: 15, marginBottom: 10 },
  bidIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' },
  bidTitle: { fontSize: 15, fontWeight: '800', color: c.navy, lineHeight: 20 },
  bidMeta: { fontSize: 12, color: c.muted2, marginTop: 3, fontWeight: '600' },

  chargeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 14, padding: 14, marginBottom: 10 },
  chargeTitle: { fontSize: 14.5, fontWeight: '800', color: c.navy },
  chargeMeta: { fontSize: 12, color: c.muted, marginTop: 2 },
  chargeAmt: { fontSize: 14.5, fontWeight: '800', color: c.navy },
  pill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  pillT: { fontSize: 10, fontWeight: '800' },
  pillPaid: { backgroundColor: c.goodBg }, pillPaidT: { color: c.good },
  pillFail: { backgroundColor: '#fdeaea' }, pillFailT: { color: '#b4232a' },
  pillPend: { backgroundColor: '#fdf3e2' }, pillPendT: { color: c.amber },

  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,26,47,0.5)' },
  sheet: { backgroundColor: c.white, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 32 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.line, marginBottom: 14 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: c.navy },
  sheetSub: { fontSize: 13, color: c.muted, marginTop: 4, marginBottom: 12 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: c.line, borderRadius: 14, padding: 14, marginTop: 10 },
  optIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: c.tealBg, alignItems: 'center', justifyContent: 'center' },
  optTitle: { fontSize: 15, fontWeight: '800', color: c.navy },
  optBody: { fontSize: 12, color: c.muted, marginTop: 2 },
  optPrice: { fontSize: 16, fontWeight: '800', color: c.navy },
  sheetNote: { fontSize: 11.5, color: c.muted, marginTop: 14, lineHeight: 16 },
  sheetCancel: { fontSize: 14.5, fontWeight: '700', color: c.muted, textAlign: 'center', marginTop: 16 },
});
