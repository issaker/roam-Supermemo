/**
 * Roam Supermemo Theme System
 *
 * Design Principle:
 * - All colors inherit from Roam body automatically via CSS
 * - Only functional colors (intent, cloze masks) are explicitly defined
 * - Simple and straightforward - no complex JS injection needed
 *
 * Algorithm color scheme:
 * - SM2:        green  (success) — memory card with adaptive grading
 * - Progressive: orange (warning) — reading card with exponential curve
 * - FixedTime:  blue   (primary) — custom time card with user-defined interval
 */

import { SchedulingAlgorithm } from '~/models/session';

// Intent color mapping - uses Roam's CSS variables
export const intentColors = {
  primary: 'var(--roam-primary-color, #8cb4ff)',
  success: 'var(--roam-success-color, #56d364)',
  warning: 'var(--roam-warning-color, #d29922)',
  danger: 'var(--roam-danger-color, #f85149)',
  none: 'inherit',
  default: 'inherit',
};

// Helper function to get color by intent
export const getIntentColor = (intent?: string): string => {
  if (!intent) return 'inherit';
  return intentColors[intent as keyof typeof intentColors] || 'inherit';
};

// Common color utilities
export const colors = {
  // Transparent backgrounds with opacity for overlays (buttons, etc.)
  overlayLight: 'rgba(128, 128, 128, 0.08)',
  overlayLightHover: 'rgba(128, 128, 128, 0.12)',

  // Cloze card background (light gray for hidden state)
  clozeHidden: '#e1e3e5',
  clozeVisible: 'transparent',

  // Border colors
  borderSubtle: 'rgba(128, 128, 128, 0.15)',

  // Text colors
  textMuted: 'var(--roam-text-muted-color, #888)',

  // Algorithm indicator colors
  modeSM2: 'var(--roam-success-color, #56d364)',
  modeProgressive: 'var(--roam-warning-color, #d29922)',
  modeFixedTime: 'var(--roam-primary-color, #8cb4ff)',

  lineByLineCurrentBorder: 'var(--roam-success-color, #56d364)',
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
