import type React from 'react';
import { colors } from './colors';

export const muxPlayerThemeProps = {
  accentColor: colors.primary.light,
  style: {
    // No --controls-backdrop-color: Mux paints that colour across the whole
    // player — not behind the control bar — whenever the media is paused or
    // the pointer is active. At the 70% black it was set to, pausing washed
    // the picture out, and entering fullscreen (which leaves the pointer
    // active) covered the screen while the audio kept playing. Left unset it
    // falls back to transparent, and the control bar keeps its own background.
    '--media-control-background': colors.primary.light,
    '--media-control-hover-background': colors.primary.dark,
    '--media-control-color': colors.primary.contrastText,
    '--media-range-bar-color': colors.primary.light,
    '--media-range-track-color': `${colors.common.white}55`,
    width: '100%',
  } as React.CSSProperties,
};
