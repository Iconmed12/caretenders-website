// Sign in against the same Supabase project as the website, so an account made
// on getcana.co.uk works here with no extra setup.
//
// The app is members only: nothing is reachable until there is a session.
import 'react-native-url-polyfill/auto';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

const extra = (Constants.expoConfig && Constants.expoConfig.extra) || {};

export const supabase = createClient(extra.supabaseUrl, extra.supabaseAnonKey, {
  auth: {
    // AsyncStorage keeps them signed in between app launches.
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Only meaningful on the web, where the session arrives in the URL.
    detectSessionInUrl: false,
  },
});

// Supabase only refreshes tokens while the app is awake. Without this, a phone
// left in a pocket overnight comes back to an expired session.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

const AuthContext = createContext({ session: null, loading: true });

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    // Existing session, if they signed in on a previous launch.
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session || null);
      setLoading(false);
    });

    // Fires on sign in, sign out and token refresh.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!alive) return;
      setSession(next || null);
      setLoading(false);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// Turns Supabase's wording into something a care manager can act on.
export function friendlyAuthError(err) {
  const msg = String((err && err.message) || '').toLowerCase();
  if (msg.indexOf('invalid login') !== -1) {
    return 'That email or password is not right. Check them and try again.';
  }
  if (msg.indexOf('email not confirmed') !== -1) {
    return 'Your email has not been confirmed yet. Check your inbox for the confirmation link.';
  }
  if (msg.indexOf('network') !== -1 || msg.indexOf('fetch') !== -1) {
    return 'Could not reach Cana. Check your internet connection and try again.';
  }
  if (msg.indexOf('rate limit') !== -1 || msg.indexOf('too many') !== -1) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  return (err && err.message) || 'Something went wrong. Please try again.';
}
