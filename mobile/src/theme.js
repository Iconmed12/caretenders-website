// Cana Bids design tokens. Mirrors the website so the app feels like the
// same product.
export const c = {
  navy: '#0b1929',
  ink: '#1c3040',
  cyan: '#00c9e0',
  teal: '#0891a3',
  muted: '#5b6b78',
  muted2: '#93a6b1',
  line: '#e9eff3',
  line2: '#f2f6f8',
  bg: '#f4f8fa',
  white: '#ffffff',
  good: '#0e9f6e',
  goodBg: '#e6f8ef',
  amber: '#e8912b',
  tealBg: '#e7f6f9',
};

export const t = {
  h1: { fontSize: 24, fontWeight: '700', color: c.navy },
  h2: { fontSize: 19, fontWeight: '700', color: c.navy },
  title: { fontSize: 16, fontWeight: '700', color: c.navy },
  body: { fontSize: 14, color: c.ink },
  small: { fontSize: 12, color: c.muted },
  tiny: { fontSize: 11, color: c.muted2 },
};

export const card = {
  backgroundColor: c.white,
  borderWidth: 1,
  borderColor: c.line,
  borderRadius: 14,
  padding: 14,
  marginBottom: 12,
};
