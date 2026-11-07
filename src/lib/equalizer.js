export const EQ_FREQUENCIES = [60, 240, 1000, 3500, 10000];
export const EQ_LABELS = ['60 Hz', '240 Hz', '1 kHz', '3.5 kHz', '10 kHz'];

export const EQ_PRESETS = {
  flat: { label: 'Datar', gains: [0, 0, 0, 0, 0] },
  bass: { label: 'Bass booster', gains: [7, 5, 1, -1, -2] },
  vocal: { label: 'Vokal', gains: [-3, -1, 4, 5, 2] },
  rock: { label: 'Rock', gains: [5, 3, -2, 3, 5] },
  pop: { label: 'Pop', gains: [2, 4, 1, 2, 3] },
  electronic: { label: 'Elektronik', gains: [6, 3, -1, 2, 6] },
  night: { label: 'Malam', gains: [-2, 1, 3, 1, -4] },
};

export function gainsForPreset(preset) {
  return EQ_PRESETS[preset]?.gains?.slice() || [0, 0, 0, 0, 0];
}
