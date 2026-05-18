/**
 * useOnBlockInteract Hook
 *
 * Monitors when users enter/leave Roam block text areas.
 * Used to detect tag changes on blocks (adding/removing #memo)
 * and trigger data refresh when tags change.
 *
 * Uses the 'arrive' library to detect dynamically created DOM elements.
 */
import React from 'react';
import 'arrive';

const useOnBlockInteract = ({
  onEnterCallback,
  onLeaveCallback,
}: {
  onEnterCallback: (_elm: HTMLTextAreaElement) => void;
  onLeaveCallback: (_elm: HTMLTextAreaElement) => void;
}) => {
  React.useEffect(() => {
    document.leave('textarea.rm-block-input', onLeaveCallback);
    document.arrive('textarea.rm-block-input', onEnterCallback);

    return () => {
      document.unbindLeave('textarea.rm-block-input', onLeaveCallback);
      document.unbindArrive('textarea.rm-block-input', onEnterCallback);
    };
  }, [onEnterCallback, onLeaveCallback]);
};

export default useOnBlockInteract;
