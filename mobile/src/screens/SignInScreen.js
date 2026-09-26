import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { c } from '../theme';
import { supabase, friendlyAuthError } from '../auth';
import Wordmark from '../components/Wordmark';
import { IconEye, IconEyeOff, IconMail, IconLock, IconArrowRight, IconBank } from '../icons';

/**
 * The front door. Cana Bids is members only.
 *
 * Deliberately no "create account" / buy button: paid accounts are set up on the
 * website, and keeping purchase out of the app is what keeps the Apple and Google
 * commission at zero. "Continue with company invite" is a FREE join (a seat on an
 * owner's plan), so it is allowed. Do not add a buy link here without checking the
 * store rules first.
 */
export default function SignInScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  async function signIn() {
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) {
      setError(friendlyAuthError(err));
      setBusy(false);
    }
  }

  async function forgotPassword() {
    const addr = email.trim();
    if (!addr) { setError('Enter your email address first, then tap Forgot password.'); return; }
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.resetPasswordForEmail(addr);
    setBusy(false);
    if (err) { setError(friendlyAuthError(err)); return; }
    Alert.alert('Check your email', 'If there is a Cana Bids account for ' + addr + ', a link to set a new password is on its way.');
  }

  return (
    <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingTop: Math.max(insets.top, 20) + 14, paddingBottom: Math.max(insets.bottom, 20) + 10 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Wordmark height={34} />

        <Text style={s.h1}>Welcome back</Text>
        <Text style={s.sub}>Sign in to find opportunities, manage your bids and stay updated.</Text>

        {/* Trust panel, matches the website's tone. */}
        <View style={s.trust}>
          <View style={s.trustIcon}><IconLock size={20} color={c.navy} /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.trustTitle}>Secure access to public sector opportunities</Text>
            <Text style={s.trustBody}>Verified procurement access, tenders from across the UK.</Text>
          </View>
        </View>

        <Text style={s.label}>EMAIL ADDRESS</Text>
        <View style={s.field}>
          <IconMail size={19} color={c.muted2} />
          <TextInput
            style={s.fieldInput}
            value={email}
            onChangeText={setEmail}
            placeholder="name@organisation.co.uk"
            placeholderTextColor={c.muted2}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            editable={!busy}
          />
        </View>

        <Text style={s.label}>PASSWORD</Text>
        <View style={s.field}>
          <IconLock size={19} color={c.muted2} />
          <TextInput
            style={s.fieldInput}
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            placeholderTextColor={c.muted2}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={signIn}
            editable={!busy}
          />
          <TouchableOpacity
            onPress={() => setShowPassword((on) => !on)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <IconEyeOff size={19} color={c.muted} /> : <IconEye size={19} color={c.muted2} />}
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={forgotPassword} disabled={busy} activeOpacity={0.7} style={s.forgotWrap}>
          <Text style={s.forgot}>Forgot password?</Text>
        </TouchableOpacity>

        {!!error && <Text style={s.error}>{error}</Text>}

        <TouchableOpacity style={[s.cta, !canSubmit && s.ctaOff]} onPress={signIn} disabled={!canSubmit} activeOpacity={0.85}>
          {busy ? <ActivityIndicator color="#04303a" /> : (
            <>
              <Text style={s.ctaText}>Sign in</Text>
              <IconArrowRight size={19} color="#04303a" />
            </>
          )}
        </TouchableOpacity>

        <View style={s.orRow}>
          <View style={s.orLine} />
          <Text style={s.orText}>or</Text>
          <View style={s.orLine} />
        </View>

        <TouchableOpacity style={s.invite} activeOpacity={0.85} onPress={() => navigation.navigate('Join')}>
          <IconBank size={20} color={c.navy} />
          <Text style={s.inviteText}>Continue with company invite</Text>
        </TouchableOpacity>

        <Text style={s.foot}>New to Cana? Accounts are set up at getcana.co.uk</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.white },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  h1: { fontSize: 30, fontWeight: '800', color: c.navy, marginTop: 26, letterSpacing: -0.6 },
  sub: { fontSize: 14.5, color: c.muted, marginTop: 8, lineHeight: 21 },
  trust: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: c.tealBg, borderRadius: 15, padding: 15, marginTop: 22 },
  trustIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#d3eef3', alignItems: 'center', justifyContent: 'center' },
  trustTitle: { fontSize: 13.5, fontWeight: '800', color: c.navy, lineHeight: 18 },
  trustBody: { fontSize: 12, color: c.muted, marginTop: 3, lineHeight: 16 },
  label: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.6, color: c.muted2, marginTop: 22, marginBottom: 7 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: c.line, borderRadius: 13, paddingHorizontal: 13, backgroundColor: c.white },
  fieldInput: { flex: 1, paddingVertical: 14, fontSize: 15, color: c.ink },
  forgotWrap: { alignSelf: 'flex-end', marginTop: 12 },
  forgot: { fontSize: 13, fontWeight: '700', color: c.teal },
  error: { fontSize: 13, color: '#b4232a', backgroundColor: '#fdeaea', borderRadius: 10, padding: 11, marginTop: 14, lineHeight: 18 },
  cta: { flexDirection: 'row', gap: 8, backgroundColor: c.brand, borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  ctaOff: { opacity: 0.45 },
  ctaText: { fontSize: 15.5, fontWeight: '800', color: '#04303a' },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 22 },
  orLine: { flex: 1, height: 1, backgroundColor: c.line },
  orText: { fontSize: 12.5, color: c.muted2, fontWeight: '600' },
  invite: { flexDirection: 'row', gap: 10, borderWidth: 1, borderColor: c.line, borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  inviteText: { fontSize: 14.5, fontWeight: '700', color: c.navy },
  foot: { fontSize: 12.5, color: c.muted2, textAlign: 'center', marginTop: 20, lineHeight: 19 },
});
