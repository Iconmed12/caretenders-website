import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { c } from '../theme';
import LogoMark from './LogoMark';
import { IconAlerts } from '../icons';

const MIN_TOP = 22;

/**
 * The white app bar used across the tabs: the ring-check mark on the left with
 * either the "Cana Bids" wordmark (brand) or a screen title, and on the right a
 * bell and the member's avatar. `children` sits under the row (search, chips).
 */
export default function TopBar({ brand, title, subtitle, initials, alert, onBell, onAvatar, children }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.wrap, { paddingTop: Math.max(insets.top, MIN_TOP) + 8 }]}>
      <View style={s.row}>
        <View style={s.left}>
          <LogoMark size={32} />
          <View style={{ flex: 1 }}>
            {brand ? (
              <Text style={s.brand} numberOfLines={1}>
                <Text style={{ color: c.navy }}>Cana </Text>
                <Text style={{ color: c.cyan }}>Bids</Text>
              </Text>
            ) : (
              <Text style={s.title} numberOfLines={1}>{title}</Text>
            )}
            {!!subtitle && <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text>}
          </View>
        </View>

        <View style={s.right}>
          <TouchableOpacity
            style={s.bell}
            onPress={onBell}
            disabled={!onBell}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Activity"
          >
            <IconAlerts size={21} color={c.navy} />
            {alert ? <View style={s.dot} /> : null}
          </TouchableOpacity>
          {!!initials && (
            <TouchableOpacity style={s.avatar} onPress={onAvatar} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Your account">
              <Text style={s.avatarText}>{initials}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {children}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { backgroundColor: c.white, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: c.line },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  left: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 },
  brand: { fontSize: 24, fontWeight: '800', letterSpacing: -0.6 },
  title: { fontSize: 25, fontWeight: '800', color: c.navy, letterSpacing: -0.6 },
  subtitle: { fontSize: 11.5, color: c.muted, marginTop: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bell: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: 4, backgroundColor: '#e5484d', borderWidth: 1.5, borderColor: c.white },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.navy, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontWeight: '800', color: '#fff' },
});
