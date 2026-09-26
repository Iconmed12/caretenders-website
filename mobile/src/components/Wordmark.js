// The Cana Bids logo, drawn in code so it is pixel-identical on every screen and
// needs no image asset. "Cana" in navy (white on dark), "Bids" in cyan, with the
// circular check mark. Matches the website logo spec (#00C9E0 for "Bids").
import React from 'react';
import { View, Text } from 'react-native';
import { c } from '../theme';
import LogoMark from './LogoMark';

export default function Wordmark({ height = 30, onDark = false }) {
  const cana = onDark ? '#ffffff' : c.navy;
  const fontSize = height * 0.82;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ marginRight: height * 0.28 }}>
        <LogoMark size={height * 1.05} onDark={onDark} />
      </View>
      <Text style={{ fontSize, fontWeight: '800', letterSpacing: -0.5 }}>
        <Text style={{ color: cana }}>Cana </Text>
        <Text style={{ color: c.cyan }}>Bids</Text>
      </Text>
    </View>
  );
}
