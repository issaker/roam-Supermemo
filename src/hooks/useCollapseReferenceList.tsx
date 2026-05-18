/**
 * useCollapseReferenceList Hook
 *
 * Auto-collapses the data page reference section in Roam's sidebar
 * to reduce visual noise. Listens for route changes and DOM mutations
 * to re-apply collapsing when new references appear.
 */
import * as React from 'react';
import * as asyncUtils from '~/utils/async';
import * as domUtils from '~/utils/dom';

const useCollapseReferenceList = ({ dataPageTitle }) => {
  const collapseDataReferenceBlock = React.useMemo(() => {
    const fn = async () => {
      await asyncUtils.sleep(100);
      const elmList = [
        ...Array.from(document.querySelectorAll('.rm-ref-page-view .rm-ref-page-view-title')),
      ].filter((elm) => elm.textContent === dataPageTitle);

      for (const elm of elmList) {
        const parentNode = elm?.parentNode as ParentNode | null;
        const collapseControlBtn = parentNode?.querySelector('.rm-caret-open');
        collapseControlBtn && domUtils.simulateMouseClick(collapseControlBtn);
      }
    };

    return fn;
  }, [dataPageTitle]);
  const [currentRoute, setCurrentRoute] = React.useState('');

  React.useEffect(() => {
    collapseDataReferenceBlock();

    const onRouteChange = () => {
      setCurrentRoute(location.href);
      collapseDataReferenceBlock();
    };
    window.addEventListener('popstate', onRouteChange);
    return () => {
      window.removeEventListener('popstate', onRouteChange);
    };
  }, [dataPageTitle, collapseDataReferenceBlock]);

  React.useEffect(() => {
    // Debounce: prevent MutationObserver callback DOM changes from re-triggering the observer
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedCollapse = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        collapseDataReferenceBlock();
      }, 300);
    };

    const observer = new MutationObserver(debouncedCollapse);
    (async () => {
      await asyncUtils.sleep(100);
      const dailyLogsContainerElm = document.querySelector('.roam-log-container');

      if (!dailyLogsContainerElm) return;
      observer.observe(dailyLogsContainerElm, { childList: true });
    })();
    return () => {
      observer.disconnect();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [collapseDataReferenceBlock, currentRoute]);
};
export default useCollapseReferenceList;
