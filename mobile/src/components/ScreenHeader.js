import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { c } from '../theme';
import Wordmark from './Wordmark';
import { IconAlerts } from '../icons';

// Some Android builds report a top inset of 0 even though the status bar sits
// over the app, which is what jams content against the top. Floor it.
const MIN_TOP = 22;

/**
 * The white app bar every main tab opens with: the Cana Bids wordmark on the
 * left and a bell on the right, then the screen's title and anything beneath it.
 * One component so Home, Find, S.A.T and Profile all read as the same product.
 *
 * `onBell` makes the bell tappable (usually to Ongoing); `children` sits under
 * the title, `right` can replace the bell for a screen that needs its own control.
 */
export default function ScreenHeader({ title, subtitle, children, onBell, right }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.wrap, { paddingTop: Math.max(insets.top, MIN_TOP) + 8 }]}>
      <View style={s.bar}>
        <Wordmark height={26} />
        {right || (
          <TouchableOpacity
            style={s.bell}
            onPress={onBell}
            disabled={!onBell}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Activity"
          >
            <IconAlerts size={21} color={c.navy} />
          </TouchableOpacity>
        )}
      </View>

      {(title || subtitle) && (
        <View style={s.titles}>
          {!!subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
          {!!title && <Text style={s.title}>{title}</Text>}
        </View>
      )}

      {children}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    backgroundColor: c.white,
    paddingHorizontal: 17,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bell: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  titles: { marginTop: 16 },
  subtitle: { fontSize: 12.5, color: c.muted, fontWeight: '700' },
  title: { fontSize: 25, fontWeight: '800', color: c.navy, letterSpacing: -0.5, marginTop: 2 },
});
