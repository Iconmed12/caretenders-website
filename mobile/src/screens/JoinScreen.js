import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { c } from '../theme';
import { supabase, friendlyAuthError } from '../auth';
import { inviteTokenFrom, fetchInviteInfo, acceptInvite } from '../api';
import Wordmark from '../components/Wordmark';
import { IconEye, IconEyeOff, IconLock, IconArrowRight } from '../icons';

/**
 * Accept a company invite: paste the invite link, confirm the company, then set a
 * name and password. This creates a FREE seat on the owner's plan (no purchase),
 * so it is allowed in the app. On success we sign the new account straight in.
 */
export default function JoinScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [link, setLink] = useState('');
  const [info, setInfo] = useState(null);     // { valid, email, department, enterprise_name }
  const [token, setToken] = useState('');
  const [firstName, setFirst] = useState('');
  const [lastName, setLast] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function lookUp() {
    setError('');
    const tok = inviteTokenFrom(link);
    if (!tok) { setError('Paste the full invite link from your email.'); return; }
    setBusy(true);
    const res = await fetchInviteInfo(tok);
    setBusy(false);
    if (!res || !res.valid) {
      const reason = res && res.reason;
      setError(
        reason === 'expired' ? 'That invite has expired. Please ask for a new one.'
          : reason === 'used' ? 'That invite has already been used. Try signing in instead.'
            : 'We could not find that invite. Check the link and try again.'
      );
      return;
    }
    setToken(tok);
    setInfo(res);
  }

  async function join() {
    setError('');
    if (!firstName.trim()) { setError('Please enter your first name.'); return; }
    if (password.length < 8) { setError('Please choose a password of at least 8 characters.'); return; }
    setBusy(true);
    try {
      await acceptInvite({ token, firstName: firstName.trim(), lastName: lastName.trim(), password });
      // Sign straight in with the account we just made; the auth listener then
      // swaps to the app.
      const { error: err } = await supabase.auth.signInWithPassword({ email: info.email, password });
      if (err) {
        setBusy(false);
        setError(friendlyAuthError(err));
      }
      // On success this screen unmounts, so no need to clear busy.
    } catch (e) {
      setBusy(false);
      if (e.existing) {
        setError('You already have a Cana account with this email. Please go back and sign in.');
      } else {
        setError(e.message || 'Could not create your account.');
      }
    }
  }

  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: Math.max(insets.top, 20) + 6, paddingBottom: Math.max(insets.bottom, 20) + 10 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Wordmark height={30} />
        <Text style={s.h1}>Join your company</Text>
        <Text style={s.sub}>Use the invite your company owner emailed you. Your seat is covered by their plan.</Text>

        {!info ? (
          <>
            <Text style={s.label}>INVITE LINK</Text>
            <TextInput
              style={s.input}
              value={link}
              onChangeText={setLink}
              placeholder="Paste the link from your invite email"
              placeholderTextColor={c.muted2}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {!!error && <Text style={s.error}>{error}</Text>}
            <TouchableOpacity style={[s.cta, busy && s.ctaOff]} onPress={lookUp} disabled={busy} activeOpacity={0.85}>
              {busy ? <ActivityIndicator color="#04303a" /> : (
                <><Text style={s.ctaText}>Find my invitation</Text><IconArrowRight size={19} color="#04303a" /></>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={s.company}>
              <Text style={s.companyLabel}>JOINING</Text>
              <Text style={s.companyName}>{info.enterprise_name}</Text>
              <Text style={s.companyMeta}>
                {info.email}{info.department ? '  ·  ' + info.department : ''}
              </Text>
            </View>

            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>FIRST NAME</Text>
                <TextInput style={s.input} value={firstName} onChangeText={setFirst} placeholder="First" placeholderTextColor={c.muted2} editable={!busy} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>LAST NAME</Text>
                <TextInput style={s.input} value={lastName} onChangeText={setLast} placeholder="Last" placeholderTextColor={c.muted2} editable={!busy} />
              </View>
            </View>

            <Text style={s.label}>CHOOSE A PASSWORD</Text>
            <View style={s.field}>
              <IconLock size={19} color={c.muted2} />
              <TextInput
                style={s.fieldInput}
                value={password}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                placeholderTextColor={c.muted2}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!busy}
              />
              <TouchableOpacity onPress={() => setShow((on) => !on)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                {showPassword ? <IconEyeOff size={19} color={c.muted} /> : <IconEye size={19} color={c.muted2} />}
              </TouchableOpacity>
            </View>

            {!!error && <Text style={s.error}>{error}</Text>}

            <TouchableOpacity style={[s.cta, busy && s.ctaOff]} onPress={join} disabled={busy} activeOpacity={0.85}>
              {busy ? <ActivityIndicator color="#04303a" /> : (
                <><Text style={s.ctaText}>Create account and join</Text><IconArrowRight size={19} color="#04303a" /></>
              )}
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.7} style={{ marginTop: 20 }}>
          <Text style={s.back}>Back to sign in</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.white },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  h1: { fontSize: 27, fontWeight: '800', color: c.navy, marginTop: 22, letterSpacing: -0.5 },
  sub: { fontSize: 14, color: c.muted, marginTop: 8, lineHeight: 20 },
  label: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.6, color: c.muted2, marginTop: 20, marginBottom: 7 },
  input: { borderWidth: 1, borderColor: c.line, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 14, fontSize: 15, color: c.ink, backgroundColor: c.white },
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: c.line, borderRadius: 13, paddingHorizontal: 13, backgroundColor: c.white },
  fieldInput: { flex: 1, paddingVertical: 14, fontSize: 15, color: c.ink },
  row: { flexDirection: 'row', gap: 12 },
  company: { backgroundColor: c.tealBg, borderRadius: 14, padding: 15, marginTop: 22 },
  companyLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, color: c.teal },
  companyName: { fontSize: 18, fontWeight: '800', color: c.navy, marginTop: 4 },
  companyMeta: { fontSize: 12.5, color: c.muted, marginTop: 4 },
  error: { fontSize: 13, color: '#b4232a', backgroundColor: '#fdeaea', borderRadius: 10, padding: 11, marginTop: 14, lineHeight: 18 },
  cta: { flexDirection: 'row', gap: 8, backgroundColor: c.brand, borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  ctaOff: { opacity: 0.55 },
  ctaText: { fontSize: 15.5, fontWeight: '800', color: '#04303a' },
  back: { fontSize: 13.5, fontWeight: '700', color: c.teal, textAlign: 'center' },
});
