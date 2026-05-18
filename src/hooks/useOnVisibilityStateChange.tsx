/**
 * useOnVisibilityStateChange Hook
 *
 * Triggers a callback when the browser tab becomes visible again.
 * Used to refresh practice data when the user returns to Roam.
 */
import * as React from 'react';

const useOnVisibilityStateChange = (callback: () => void) => {
  // useRef: store callback reference, prevent frequent event listener re-registration when callback changes
  const callbackRef = React.useRef(callback);
  callbackRef.current = callback;

  React.useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        callbackRef.current();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
};

export default useOnVisibilityStateChange;
