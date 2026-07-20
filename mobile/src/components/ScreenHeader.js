import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { c } from '../theme';

// Some Android builds report a top inset of 0 even though the status bar is
// sitting over the app, which is what makes content look jammed against the
// top of the screen. Floor it so every phone gets breathing room.
const MIN_TOP = 22;

/**
 * The navy panel every main screen opens with, so Home, Find, Ongoing and
 * Profile all read as the same app.
 *
 * `right` takes a control shown opposite the title, `children` takes anything
 * that sits under it inside the panel, like Home's row of counts.
 */
export default function ScreenHeader({ title, subtitle, right, children }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[s.wrap, { paddingTop: Math.max(insets.top, MIN_TOP) + 10 }]}>
      <View style={s.row}>
        <View style={s.text}>
          {!!subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
          <Text style={s.title}>{title}</Text>
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    backgroundColor: c.navy,
    paddingHorizontal: 17,
    paddingBottom: 18,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  text: { flex: 1 },
  subtitle: { fontSize: 12.5, color: '#8fa7b8', fontWeight: '600' },
  title: { fontSize: 23, fontWeight: '800', color: '#fff', letterSpacing: -0.4, marginTop: 1 },
});
