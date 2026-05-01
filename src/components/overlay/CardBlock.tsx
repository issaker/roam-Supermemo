import * as React from 'react';
import { Breadcrumbs as BreadcrumbsType } from '~/queries';
import styled from '@emotion/styled';
import * as domUtils from '~/utils/dom';
import * as asyncUtils from '~/utils/async';
import { Icon } from '@blueprintjs/core';
import useCloze from '~/hooks/useCloze';
import { colors } from '~/theme';

// Extract render logic into a standalone function so it can be called
// both immediately (on card change) and debounced (on blur re-render).
// See inline call sites below for why this matters.
const renderRoamBlock = async ({
  containerEl,
  uid,
  autoExpandRef,
  onRenderComplete,
  handleBlockBlur,
  setRenderedBlockElm,
  observerRef,
  registeredTextareasRef,
}: {
  containerEl: HTMLElement;
  uid: string;
  autoExpandRef: React.MutableRefObject<boolean>;
  onRenderComplete?: () => void;
  handleBlockBlur: () => void;
  setRenderedBlockElm: (el: HTMLElement | null) => void;
  observerRef: React.MutableRefObject<MutationObserver | null>;
  registeredTextareasRef: React.MutableRefObject<Set<HTMLTextAreaElement>>;
}) => {
  try {
    await window.roamAlphaAPI.ui.components.unmountNode({ el: containerEl });
    await window.roamAlphaAPI.ui.components.renderBlock({ uid, el: containerEl });

    const roamBlockElm = containerEl.querySelector('.rm-block') as HTMLElement | null;
    setRenderedBlockElm(roamBlockElm);
    const isCollapsed = roamBlockElm?.classList.contains('rm-block--closed');
    if (autoExpandRef.current && isCollapsed) {
      const expandControlBtn = containerEl.querySelector('.block-expand .rm-caret');
      domUtils.simulateMouseClick(expandControlBtn);
      await asyncUtils.sleep(100);
      domUtils.simulateMouseClick(expandControlBtn);
    } else if (!autoExpandRef.current && !isCollapsed) {
      domUtils.collapseBlockOnPage(uid);
    }

    // Disconnect any existing observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    // Add a mutation observer to detect dynamically added textareas
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement) {
              const newTextareas = node.querySelectorAll('textarea');
              if (newTextareas.length > 0) {
                newTextareas.forEach((textarea) => {
                  textarea.removeEventListener('blur', handleBlockBlur);
                  textarea.addEventListener('blur', handleBlockBlur);
                  registeredTextareasRef.current.add(textarea);
                });
              }
            }
          });
        }
      });
    });

    observer.observe(containerEl, { childList: true, subtree: true });
    observerRef.current = observer;

    // Notify parent that rendering is complete
    onRenderComplete?.();
  } catch (err) {
    console.error('Memo: Failed to render block', err);
  }
};

const CardBlock = ({
  refUid,
  showAnswers,
  setHasCloze,
  breadcrumbs,
  showBreadcrumbs,
  onRenderComplete,
  hideChildren,
  autoExpand = true,
}: {
  refUid: string;
  showAnswers: boolean;
  setHasCloze: (_hasCloze: boolean) => void;
  breadcrumbs: BreadcrumbsType[];
  showBreadcrumbs: boolean;
  onRenderComplete?: () => void;
  hideChildren?: boolean;
  autoExpand?: boolean;
}) => {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [renderedBlockElm, setRenderedBlockElm] = React.useState<HTMLElement | null>(null);
  useCloze({ renderedBlockElm: renderedBlockElm as HTMLElement, hasClozeCallback: setHasCloze });

  const [forceUpdate, setForceUpdate] = React.useState(0);

  const refUidRef = React.useRef(refUid);
  const autoExpandRef = React.useRef(autoExpand);

  const observerRef = React.useRef<MutationObserver | null>(null);

  const registeredTextareasRef = React.useRef<Set<HTMLTextAreaElement>>(new Set());

  React.useEffect(() => {
    refUidRef.current = refUid;
  }, [refUid]);

  React.useEffect(() => {
    autoExpandRef.current = autoExpand;
  }, [autoExpand]);

  const handleBlockBlur = React.useCallback(() => {
    // In the practice dialog, blur-based re-rendering destroys the DOM
    // and breaks Roam's focus management (arrow navigation, text selection).
    // Skip re-rendering for dialog blocks — they are in a read-only context.
    const dialog = ref.current?.closest('[role="dialog"]');
    if (dialog) return;

    setForceUpdate((prev) => {
      return prev + 1;
    });
  }, []);

  // ── Immediate render on card change ──
  // Separated from the debounced blur re-render to prevent flash:
  // When refUid changes, React commits the new render with the new
  // showAnswers CSS immediately, but the Roam block inside ContentWrapper
  // is still the OLD card's block until renderRoamBlock runs.  If we
  // debounced this (like the blur re-render), the CSS would show/hide the
  // old card's children with the new card's showAnswers for 100ms — a flash.
  React.useEffect(() => {
    if (!ref.current || !refUid) return;
    renderRoamBlock({
      containerEl: ref.current,
      uid: refUid,
      autoExpandRef,
      onRenderComplete,
      handleBlockBlur,
      setRenderedBlockElm,
      observerRef,
      registeredTextareasRef,
    });
  }, [refUid, handleBlockBlur, onRenderComplete]);

  // ── Debounced re-render for blur-based forceUpdate ──
  // Textarea blur events can fire rapidly when the user is editing; the
  // debounce coalesces these into a single re-render.  Does NOT include
  // refUid in deps — card changes are handled by the immediate effect above.
  // Including refUid here would cause a second render 100ms after every card
  // transition (double the DOM work: unmount, re-mount, re-observer).
  React.useEffect(() => {
    if (!ref.current || !refUid) return;

    const debouncedReRender = asyncUtils.debounce(
      () =>
        renderRoamBlock({
          containerEl: ref.current!,
          uid: refUidRef.current,
          autoExpandRef,
          onRenderComplete,
          handleBlockBlur,
          setRenderedBlockElm,
          observerRef,
          registeredTextareasRef,
        }),
      100
    );

    debouncedReRender();

    return () => {
      // Cancel any pending debounced re-render so it doesn't fire after
      // this effect re-runs (stale closure would render wrong uid).
      debouncedReRender.cancel();

      registeredTextareasRef.current.forEach((textarea) => {
        textarea.removeEventListener('blur', handleBlockBlur);
      });
      registeredTextareasRef.current = new Set();

      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceUpdate, autoExpand, handleBlockBlur, onRenderComplete]);

  return (
    <div>
      {breadcrumbs && showBreadcrumbs && <Breadcrumbs breadcrumbs={breadcrumbs} />}
      <ContentWrapper
        ref={ref}
        showAnswers={showAnswers}
        hideChildren={hideChildren}
      ></ContentWrapper>
    </div>
  );
};

const ContentWrapper = styled.div<{
  showAnswers: boolean;
  hideChildren?: boolean;
}>`
  // To align bullet on the left + ref count on the right correctly
  position: relative;
  left: -14px;
  width: calc(100% + 19px);

  & .rm-block-children {
    display: ${(props) => (props.showAnswers && !props.hideChildren ? 'flex' : 'none')};
  }

  & .rm-block-separator {
    min-width: unset; // Keeping roam block from expanding 100
  }

  // Only apply cloze hiding to custom clozes with {} syntax
  // Roam's native ^^ highlighting (.rm-highlight) keeps its default styles
  .roam-Supermemo-cloze {
    background-color: ${(props) => (props.showAnswers ? colors.clozeVisible : colors.clozeHidden)};
    color: ${(props) => (props.showAnswers ? 'inherit' : 'transparent')};
    overflow: hidden;
    border-radius: 2px;
    padding: 0;
    margin: 0;
  }
`;

const Breadcrumbs = ({ breadcrumbs }) => {
  const items = breadcrumbs.map((breadcrumb, index) => ({
    current: index === breadcrumbs.length - 1,
    text: breadcrumb.title || breadcrumb.string, // root pages have title but no string
  }));
  return (
    <BreadCrumbWrapper className="rm-zoom zoom-path-view">
      {items.map((item, i) => (
        <div key={i} className="rm-zoom-item">
          <span className="rm-zoom-item-content">{item.text}</span>{' '}
          {i !== items.length - 1 && <Icon icon="chevron-right" />}
        </div>
      ))}
    </BreadCrumbWrapper>
  );
};

const BreadCrumbWrapper = styled.div`
  opacity: 0.7;
  margin-left: 8px !important;
  margin-top: -4px !important;

  &.rm-zoom-item {
    cursor: auto !important;
  }
`;

export default React.memo(CardBlock);
