import * as React from 'react';
import * as Blueprint from '@blueprintjs/core';

interface UsePracticeOverlayHotkeysInput {
  onToggleBreadcrumbs: () => void;
}

export default function usePracticeOverlayHotkeys({
  onToggleBreadcrumbs,
}: UsePracticeOverlayHotkeysInput) {
  const hotkeys = React.useMemo(
    () => [
      {
        combo: 'B',
        global: true,
        label: 'Show BreadCrumbs',
        onKeyDown: onToggleBreadcrumbs,
      },
    ],
    [onToggleBreadcrumbs]
  );
  Blueprint.useHotkeys(hotkeys);
}
