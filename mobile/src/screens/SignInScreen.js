import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { c } from '../theme';
import { supabase, friendlyAuthError } from '../auth';

/**
 * The front door. Cana Bids is members only, so this is the whole app until
 * someone signs in.
 *
 * Deliberately no "sign up" or "see pricing" button. Accounts are bought on the
 * website. Keeping purchase out of the app is what keeps the Apple and Google
 * commission at zero, so do not add a buy link here without checking the store
 * rules first.
 */
export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  async function signIn() {
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    // On success the auth listener swaps this screen out, so there is nothing
    // to do here but clear the spinner if it failed.
    if (err) {
      setError(friendlyAuthError(err));
      setBusy(false);
    }
  }

  async function forgotPassword() {
    const addr = email.trim();
    if (!addr) {
      setError('Enter your email address first, then tap Forgot password.');
      return;
    }
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.resetPasswordForEmail(addr);
    setBusy(false);
    if (err) {
      setError(friendlyAuthError(err));
      return;
    }
    Alert.alert(
      'Check your email',
      'If there is a Cana Bids account for ' + addr + ', a link to set a new password is on its way.'
    );
  }

  return (
    <KeyboardAvoidingView
      style={s.wrap}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Image source={require('../../assets/logo-white.png')} style={s.logo} resizeMode="contain" />
        <Text style={s.strap}>Care sector tenders, answered.</Text>

        <View style={s.card}>
          <Text style={s.label}>Email</Text>
          <TextInput
            style={s.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@yourcompany.co.uk"
            placeholderTextColor={c.muted2}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            returnKeyType="next"
            editable={!busy}
          />

          <Text style={[s.label, { marginTop: 14 }]}>Password</Text>
          <TextInput
            style={s.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            placeholderTextColor={c.muted2}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={signIn}
            editable={!busy}
          />

          {!!error && <Text style={s.error}>{error}</Text>}

          <TouchableOpacity
            style={[s.cta, !canSubmit && s.ctaOff]}
            onPress={signIn}
            disabled={!canSubmit}
            activeOpacity={0.85}
          >
            {busy
              ? <ActivityIndicator color="#04303a" />
              : <Text style={s.ctaText}>Sign in</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={forgotPassword} disabled={busy} activeOpacity={0.7}>
            <Text style={s.forgot}>Forgot password</Text>
          </TouchableOpacity>
        </View>

        {/* Plain text on purpose, not a tappable link. See the note at the top. */}
        <Text style={s.foot}>
          Cana Bids is for members. Accounts are set up at getcana.co.uk
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.navy },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logo: { width: 168, height: 46, alignSelf: 'center' },
  strap: { color: '#8fa7b8', fontSize: 13.5, textAlign: 'center', marginTop: 10, marginBottom: 26 },
  card: { backgroundColor: c.white, borderRadius: 18, padding: 20 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: c.muted2, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: c.line, borderRadius: 12,
    paddingHorizontal: 13, paddingVertical: 13,
    fontSize: 15, color: c.ink, backgroundColor: c.white,
  },
  error: {
    fontSize: 13, color: '#b4232a', backgroundColor: '#fdeaea',
    borderRadius: 10, padding: 11, marginTop: 14, lineHeight: 18,
  },
  cta: { backgroundColor: c.cyan, borderRadius: 13, paddingVertical: 16, alignItems: 'center', marginTop: 18 },
  ctaOff: { opacity: 0.45 },
  ctaText: { fontSize: 15, fontWeight: '700', color: '#04303a' },
  forgot: { fontSize: 13, fontWeight: '600', color: c.teal, textAlign: 'center', marginTop: 16 },
  foot: { fontSize: 12.5, color: '#7b93a5', textAlign: 'center', marginTop: 26, lineHeight: 19 },
});
