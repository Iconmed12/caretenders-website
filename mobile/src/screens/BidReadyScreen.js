import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { c } from '../theme';

/**
 * Shown when a real generation has finished. The server writes and emails the
 * full bid and Word documents as the last step of the run, so this screen
 * confirms that rather than showing answer text (the API returns status only).
 */
export default function BidReadyScreen({ route }) {
  const tender = (route.params && route.params.tender) || {};

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
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity
          style={s.ghost}
          activeOpacity={0.85}
          onPress={() => Linking.openURL('https://getcana.co.uk/plans.html')}
        >
          <Text style={s.ghostText}>Add an expert review</Text>
        </TouchableOpacity>
      </View>
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
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: c.line2 },
  ghost: { borderWidth: 1, borderColor: c.line, borderRadius: 15, paddingVertical: 16, alignItems: 'center' },
  ghostText: { fontSize: 16, fontWeight: '700', color: c.navy },
});
