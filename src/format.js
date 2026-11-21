// Human-readable numbers for logs and the UI.

export function formatYears(years) {
  const y = Math.abs(years);
  if (y >= 1e9) return `${(years / 1e9).toFixed(2)} billion years`;
  if (y >= 1e6) return `${(years / 1e6).toFixed(1)} million years`;
  if (y >= 1e4) return `${Math.round(years).toLocaleString('en-US')} years`;
  if (y >= 10) return `${Math.round(years)} years`;
  return `${years.toFixed(y < 1 ? 2 : 1)} years`;
}

export function formatShortYears(years) {
  const y = Math.abs(years);
  if (y >= 1e9) return `${(years / 1e9).toFixed(2)} Gyr`;
  if (y >= 1e6) return `${(years / 1e6).toFixed(1)} Myr`;
  if (y >= 1e3) return `${(years / 1e3).toFixed(1)} kyr`;
  return `${years.toFixed(y < 10 ? 1 : 0)} yr`;
}

export function formatPower(gw) {
  if (gw >= 1000) return `${(gw / 1000).toFixed(2)} TW`;
  if (gw >= 1) return `${gw.toFixed(1)} GW`;
  return `${(gw * 1000).toFixed(0)} MW`;
}

export function formatPeople(millions) {
  if (millions >= 1000) return `${(millions / 1000).toFixed(2)} billion`;
  if (millions >= 1) return `${millions.toFixed(1)} million`;
  return `${Math.round(millions * 1e6).toLocaleString('en-US')}`;
}

export function formatRate(yearsPerSecond) {
  return `${formatShortYears(yearsPerSecond)} / s`;
}
