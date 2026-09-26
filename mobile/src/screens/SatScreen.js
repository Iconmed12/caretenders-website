import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { c } from '../theme';
import { useAuth } from '../auth';
import { fetchTenderRequests, createTenderRequest, satStatusOf, agoLabel } from '../api';
import { IconLink } from '../icons';

/**
 * Send A Tender. The member pastes the link to a tender they want but cannot
 * find on Cana, and the team sources it by hand. The monthly allowance (Access
 * 1, Pro 3, Gold unlimited) is set by plan and shared across the company; the
 * server enforces it, this screen just shows where they are up to.
 */
export default function SatScreen() {
  const { session } = useAuth();
  const token = (session && session.access_token) || '';

  const [data, setData] = useState(null);      // { requests, plan, limit, unlimited, used_this_month, remaining, shared }
  const [loading, setLoading] = useState(true);
  const [link, setLink] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    let alive = true;
    setLoading(true);
    fetchTenderRequests(token).then((d) => {
      if (!alive) return;
      setData(d);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [token]);

  useFocusEffect(load);

  async function send() {
    const clean = link.trim();
    if (!clean) { Alert.alert('Add a link', 'Please paste the tender web address first.'); return; }
    setSending(true);
    try {
      await createTenderRequest(token, { link: clean, note: note.trim() });
      setLink('');
      setNote('');
      load();
      Alert.alert('Sent', 'We have your request. We will source this tender and email you when it is on Cana.');
    } catch (e) {
      Alert.alert('Could not send', e.message || 'Please try again in a moment.');
    } finally {
      setSending(false);
    }
  }

  const requests = (data && data.requests) || [];
  const unlimited = data && data.unlimited;
  const limit = data && data.limit;
  const used = (data && data.used_this_month) || 0;
  const remaining = data && data.remaining;
  const shared = data && data.shared;
  const atLimit = !unlimited && data && remaining != null && remaining <= 0;

  let allowanceText;
  if (!data) allowanceText = '';
  else if (unlimited) allowanceText = 'Unlimited requests this month';
  else allowanceText = `${used} of ${limit} used this month`;

  return (
    <View style={s.wrap}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
          {!!data && (
            <View style={s.allowance}>
              <Text style={s.allowanceText}>{allowanceText}</Text>
              {!!shared && <Text style={s.allowanceSub}>Shared across your company</Text>}
            </View>
          )}

          <View style={s.card}>
            <Text style={s.cardTitle}>Found a tender we do not have?</Text>
            <Text style={s.cardBody}>
              Paste the link and we will source it for you, then email you when it is ready to bid on.
            </Text>

            <Text style={s.label}>TENDER LINK</Text>
            <TextInput
              style={s.input}
              value={link}
              onChangeText={setLink}
              placeholder="https://..."
              placeholderTextColor={c.muted2}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />

            <Text style={s.label}>NOTE (OPTIONAL)</Text>
            <TextInput
              style={[s.input, s.multiline]}
              value={note}
              onChangeText={setNote}
              placeholder="Anything we should know about it"
              placeholderTextColor={c.muted2}
              multiline
            />

            <TouchableOpacity
              style={[s.send, (sending || atLimit) && s.sendOff]}
              activeOpacity={0.85}
              onPress={send}
              disabled={sending || atLimit}
            >
              {sending
                ? <ActivityIndicator color="#04303a" />
                : <Text style={s.sendText}>{atLimit ? 'Monthly limit reached' : 'Send to Cana'}</Text>}
            </TouchableOpacity>
            {atLimit && (
              <Text style={s.limitNote}>
                {shared ? 'Your company has' : 'You have'} used this month's requests.
                {data && data.plan === 'gold' ? '' : ' Upgrade your plan on getcana.co.uk for more.'}
              </Text>
            )}
          </View>

          <Text style={s.secTitle}>YOUR REQUESTS</Text>
          {loading ? (
            <ActivityIndicator color={c.teal} style={{ marginTop: 18 }} />
          ) : requests.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyText}>Nothing yet. Send us your first tender above.</Text>
            </View>
          ) : (
            requests.map((r) => {
              const st = satStatusOf(r.status);
              return (
                <View key={r.id} style={s.reqRow}>
                  <View style={s.reqIcon}><IconLink size={16} color={c.navy} /></View>
                  <View style={s.reqText}>
                    <Text style={s.reqLink} numberOfLines={1}>{r.link}</Text>
                    <Text style={s.reqMeta}>{agoLabel(r.created_at)}</Text>
                  </View>
                  <View style={[
                    s.pill,
                    st.tone === 'good' ? s.pillGood : st.tone === 'off' ? s.pillOff : s.pillWait,
                  ]}>
                    <Text style={[
                      s.pillText,
                      st.tone === 'good' ? s.pillTextGood : st.tone === 'off' ? s.pillTextOff : s.pillTextWait,
                    ]}>{st.label}</Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg },
  allowance: { marginBottom: 14, backgroundColor: c.tealBg, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12 },
  allowanceText: { fontSize: 13.5, fontWeight: '800', color: c.navy },
  allowanceSub: { fontSize: 11.5, color: c.muted, marginTop: 2 },
  card: { backgroundColor: c.white, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: c.line },
  cardTitle: { fontSize: 15.5, fontWeight: '800', color: c.navy },
  cardBody: { fontSize: 12.5, color: c.muted, marginTop: 5, lineHeight: 18 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, color: c.muted2, marginTop: 16, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: c.line, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, color: c.ink, backgroundColor: c.white },
  multiline: { height: 76, textAlignVertical: 'top' },
  send: { backgroundColor: c.brand, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 18 },
  sendOff: { backgroundColor: c.line, borderWidth: 1, borderColor: c.line },
  sendText: { fontSize: 14.5, fontWeight: '800', color: '#04303a' },
  limitNote: { fontSize: 11.5, color: c.muted, textAlign: 'center', marginTop: 10, lineHeight: 17 },
  secTitle: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.8, color: c.muted2, marginTop: 24, marginBottom: 10 },
  empty: { backgroundColor: c.white, borderRadius: 14, borderWidth: 1, borderColor: c.line, padding: 18, alignItems: 'center' },
  emptyText: { fontSize: 12.5, color: c.muted2 },
  reqRow: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: c.white, borderRadius: 13, borderWidth: 1, borderColor: c.line, padding: 13, marginBottom: 10 },
  reqIcon: { width: 32, height: 32, borderRadius: 9, backgroundColor: c.tealBg, alignItems: 'center', justifyContent: 'center' },
  reqText: { flex: 1 },
  reqLink: { fontSize: 13, fontWeight: '600', color: c.ink },
  reqMeta: { fontSize: 11, color: c.muted2, marginTop: 2 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  pillWait: { backgroundColor: c.tealBg },
  pillGood: { backgroundColor: c.goodBg },
  pillOff: { backgroundColor: c.line },
  pillText: { fontSize: 11, fontWeight: '700' },
  pillTextWait: { color: c.teal },
  pillTextGood: { color: c.good },
  pillTextOff: { color: c.muted },
});
