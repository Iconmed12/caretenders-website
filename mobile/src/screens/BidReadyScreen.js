import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, Alert, ActivityIndicator } from 'react-native';
import { c } from '../theme';
import { useAuth } from '../auth';
import { requestReview } from '../api';

const REVIEW_OPTIONS = [
  { key: 'full', title: 'Full tender review', body: 'A Cana expert reviews your whole bid.' },
  { key: 'response', title: 'Response review', body: 'An expert reviews a specific response or section.' },
];

/**
 * Shown when a real generation has finished. The server writes and emails the
 * full bid and Word documents as the last step of the run, so this screen
 * confirms that rather than showing answer text (the API returns status only).
 */
export default function BidReadyScreen({ route }) {
  const tender = (route.params && route.params.tender) || {};
  const { session } = useAuth();
  const token = (session && session.access_token) || '';

  // Set when a review was added on account during generate, or when the member
  // requests one from here. Either way the card replaces the "add" button.
  const [requested, setRequested] = useState((route.params && route.params.requestedReview) || null);
  const [picking, setPicking] = useState(false);
  const [sending, setSending] = useState(false);

  const reviewLabel = requested === 'full' ? 'Full tender review' : 'Response review';

  // Request a review on account. No price or payment is shown in the app: the
  // card on file is charged in the background and the cost lives on the website
  // invoices page. We show the confirmation whether the charge clears now or the
  // team has to follow up, so the member is never left unsure.
  function send(type) {
    setPicking(false);
    setSending(true);
    requestReview(token, { review_type: type, tender_id: tender.id, tender_title: tender.title })
      .then((res) => {
        setRequested(type);
        if (res && res.message) Alert.alert('Review requested', res.message);
      })
      .catch(() => {
        Alert.alert('Could not request the review', 'Please try again, or email hello@getcana.co.uk and we will sort it out.');
      })
      .finally(() => setSending(false));
  }

  return (
    <View style={s.wrap}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
        <View style={s.okCircle}><Text style={s.okTick}>✓</Text></View>
        <Text style={s.h1}>Your bid is ready</Text>
        <Text style={s.sub}>{tender.title || 'Your tender response is complete.'}</Text>

        <View style={s.sent}>
          <Text style={s.sentTitle}>Sent to your inbox</Text>
          <Text style={s.sentBody}>
            The full bid and your Word documents have been emailed to you, ready to review and submit.
          </Text>
        </View>

        <View style={s.info}>
          <Text style={s.infoBody}>
            Every answer is written from your company profile and evidence, tailored to this tender.
            Read it through, edit anything you want, then submit through the buyer’s portal.
          </Text>
        </View>

        {!!requested && (
          <View style={s.review}>
            <Text style={s.reviewTitle}>{reviewLabel} requested</Text>
            <Text style={s.reviewBody}>
              Added to your account. We will confirm the cost by email, then a Cana expert
              gets started and sends your review across.
            </Text>
          </View>
        )}
      </ScrollView>

      {!requested && (
        <View style={s.footer}>
          <TouchableOpacity
            style={s.ghost}
            activeOpacity={0.85}
            onPress={() => setPicking(true)}
            disabled={sending}
          >
            {sending
              ? <ActivityIndicator color={c.navy} />
              : <Text style={s.ghostText}>Add an expert review</Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* Pick a review to request on account. No price shown here: the cost is
          confirmed by email and shown on the website invoices page. */}
      <Modal visible={picking} transparent animationType="slide" onRequestClose={() => setPicking(false)}>
        <View style={s.sheetOverlay}>
          <TouchableOpacity style={s.sheetBackdrop} activeOpacity={1} onPress={() => setPicking(false)} />
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Add an expert review</Text>
            <Text style={s.sheetSub}>Choose a review and we will confirm the cost by email before we start.</Text>

            {REVIEW_OPTIONS.map((opt) => (
              <TouchableOpacity key={opt.key} style={s.revRow} activeOpacity={0.85} onPress={() => send(opt.key)}>
                <View style={{ flex: 1 }}>
                  <Text style={s.revTitle}>{opt.title}</Text>
                  <Text style={s.revBody}>{opt.body}</Text>
                </View>
                <View style={s.revReq}><Text style={s.revReqText}>Request</Text></View>
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={s.sheetCancel} activeOpacity={0.7} onPress={() => setPicking(false)}>
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
  okCircle: { width: 58, height: 58, borderRadius: 29, backgroundColor: c.goodBg, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 14 },
  okTick: { fontSize: 26, color: c.good, fontWeight: '800' },
  h1: { fontSize: 26, fontWeight: '700', color: c.navy, textAlign: 'center', marginTop: 14 },
  sub: { fontSize: 14, color: c.muted, textAlign: 'center', marginTop: 6, marginBottom: 20, paddingHorizontal: 20, lineHeight: 20 },
  sent: { backgroundColor: c.goodBg, borderRadius: 15, padding: 16 },
  sentTitle: { fontSize: 15.5, fontWeight: '800', color: c.good },
  sentBody: { fontSize: 13.5, color: c.ink, marginTop: 5, lineHeight: 20 },
  info: { borderWidth: 1, borderColor: c.line, borderRadius: 15, padding: 16, marginTop: 12 },
  infoBody: { fontSize: 13.5, color: c.muted, lineHeight: 20 },
  review: { backgroundColor: c.tealBg, borderRadius: 15, padding: 16, marginTop: 12 },
  reviewTitle: { fontSize: 15, fontWeight: '800', color: c.navy },
  reviewBody: { fontSize: 13.5, color: c.ink, marginTop: 5, lineHeight: 20 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: c.line2 },
  ghost: { borderWidth: 1, borderColor: c.line, borderRadius: 15, paddingVertical: 16, alignItems: 'center' },
  ghostText: { fontSize: 16, fontWeight: '700', color: c.navy },

  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,26,47,0.5)' },
  sheet: { backgroundColor: c.white, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 28 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.line, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: c.navy, letterSpacing: -0.4 },
  sheetSub: { fontSize: 13.5, color: c.muted, marginTop: 4, marginBottom: 14, lineHeight: 19 },
  revRow: { flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: c.line, borderRadius: 14, padding: 15, marginBottom: 10 },
  revTitle: { fontSize: 15.5, fontWeight: '700', color: c.navy },
  revBody: { fontSize: 13, color: c.muted, marginTop: 3, lineHeight: 18 },
  revReq: { backgroundColor: c.tealBg, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 },
  revReqText: { fontSize: 11, fontWeight: '800', color: c.teal },
  sheetCancel: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  sheetCancelText: { fontSize: 14, fontWeight: '700', color: c.muted },
});
