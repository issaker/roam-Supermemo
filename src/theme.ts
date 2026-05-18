import { SchedulingAlgorithm } from '~/models/session';

export const intentColors = {
  primary: 'var(--roam-primary-color, #8cb4ff)',
  success: 'var(--roam-success-color, #56d364)',
  warning: 'var(--roam-warning-color, #d29922)',
  danger: 'var(--roam-danger-color, #f85149)',
  none: 'inherit',
  default: 'inherit',
};

export const getIntentColor = (intent?: string): string => {
  if (!intent) return 'inherit';
  return intentColors[intent as keyof typeof intentColors] || 'inherit';
};

export const colors = {
  overlayLight: 'rgba(128, 128, 128, 0.08)',
  overlayLightHover: 'rgba(128, 128, 128, 0.12)',
  clozeHidden: '#e1e3e5',
  clozeVisible: 'transparent',
  borderSubtle: 'rgba(128, 128, 128, 0.15)',
  textMuted: 'var(--roam-text-muted-color, #888)',
  modeSM2: intentColors.success,
  modeProgressive: intentColors.warning,
  modeFixedTime: intentColors.primary,
  lineByLineCurrentBorder: intentColors.success,
  lineByLineMasteredBorder: 'rgba(128, 128, 128, 0.15)',
};

export const getAlgorithmColor = (algorithm: SchedulingAlgorithm | undefined): string => {
  switch (algorithm) {
    case SchedulingAlgorithm.SM2: return colors.modeSM2;
    case SchedulingAlgorithm.PROGRESSIVE: return colors.modeProgressive;
    case SchedulingAlgorithm.FIXED_TIME: return colors.modeFixedTime;
    default: return colors.borderSubtle;
  }
};
