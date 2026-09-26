// Cana Bids design tokens. Mirrors the website so the app feels like the
// same product.
// Restrained, premium palette: mostly neutrals and navy, with teal reserved for
// ACTION only (buttons + the Generate FAB). No rainbow category colours.
export const c = {
  navy: '#071A2F',     // primary navy (headings, icons)
  navy2: '#10283F',    // deep secondary navy
  ink: '#0B1F33',      // main body text
  cyan: '#00C9E0',     // LOGO ONLY (brand mandate: the "Bids" mark)
  teal: '#00AFC1',     // Cana teal, used only for action
  // Buttons and the Generate FAB use the action teal, so they all match.
  brand: '#00AFC1',
  muted: '#667487',    // secondary text
  muted2: '#9AA7B3',   // hints, meta, captions
  line: '#E4E9EE',     // hairline borders
  line2: '#EFF2F5',    // lighter dividers
  bg: '#F7F9FA',       // premium off white page background
  white: '#FFFFFF',
  good: '#0E9F6E',     // status: complete
  goodBg: '#E6F8EF',
  amber: '#B7791F',    // status: urgency / warning
  tealBg: '#EFF3F6',   // neutral light surface (was a teal tint; now grey)
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
