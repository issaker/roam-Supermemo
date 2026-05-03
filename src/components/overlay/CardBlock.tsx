import * as React from 'react';
import { Breadcrumbs as BreadcrumbsType } from '~/queries';
import styled from '@emotion/styled';
import * as domUtils from '~/utils/dom';
import * as asyncUtils from '~/utils/async';
import { Icon } from '@blueprintjs/core';
import useCloze from '~/hooks/useCloze';
import { colors } from '~/theme';

const renderRoamBlock = async ({
  containerEl,
  uid,
  autoExpandRef,
  onRenderComplete,
  handleBlockBlur,
  setRenderedBlockElm,
  observerRef,
  registeredTextareasRef,
  renderGenerationRef,
  expectedGeneration,
}: {
  containerEl: HTMLElement;
  uid: string;
  autoExpandRef: React.MutableRefObject<boolean>;
  onRenderComplete?: () => void;
  handleBlockBlur: () => void;
  setRenderedBlockElm: (el: HTMLElement | null) => void;
  observerRef: React.MutableRefObject<MutationObserver | null>;
  registeredTextareasRef: React.MutableRefObject<Set<HTMLTextAreaElement>>;
  renderGenerationRef: React.MutableRefObject<number>;
  expectedGeneration: number;
}) => {
  const isStale = () => renderGenerationRef.current !== expectedGeneration;

  try {
    await window.roamAlphaAPI.ui.components.unmountNode({ el: containerEl });
    if (isStale()) return;

    await window.roamAlphaAPI.ui.components.renderBlock({ uid, el: containerEl });
    if (isStale()) return;

    const roamBlockElm = containerEl.querySelector('.rm-block') as HTMLElement | null;
    if (isStale()) return;
    setRenderedBlockElm(roamBlockElm);
    const isCollapsed = roamBlockElm?.classList.contains('rm-block--closed');
    if (autoExpandRef.current && isCollapsed) {
      domUtils.expandBlockOnPage(uid);
    } else if (!autoExpandRef.current && !isCollapsed) {
      domUtils.collapseBlockOnPage(uid);
    }

    if (observerRef.current) {
      observerRef.current.disconnect();
    }

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

    onRenderComplete?.();
  } catch (err) {
    console.error('Memo: Failed to render block', err);
  }
};

const CardBlock = ({
  refUid,
  showAnswers,
  breadcrumbs,
  showBreadcrumbs,
  onRenderComplete,
  hideChildren,
  autoExpand = true,
}: {
  refUid: string;
  showAnswers: boolean;
  breadcrumbs: BreadcrumbsType[];
  showBreadcrumbs: boolean;
  onRenderComplete?: () => void;
  hideChildren?: boolean;
  autoExpand?: boolean;
}) => {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [renderedBlockElm, setRenderedBlockElm] = React.useState<HTMLElement | null>(null);
  useCloze({ renderedBlockElm: renderedBlockElm as HTMLElement });

  const [forceUpdate, setForceUpdate] = React.useState(0);

  const refUidRef = React.useRef(refUid);
  const autoExpandRef = React.useRef(autoExpand);

  const observerRef = React.useRef<MutationObserver | null>(null);

  const registeredTextareasRef = React.useRef<Set<HTMLTextAreaElement>>(new Set());

  const renderGenerationRef = React.useRef(0);

  React.useEffect(() => {
    refUidRef.current = refUid;
  }, [refUid]);

  React.useEffect(() => {
    autoExpandRef.current = autoExpand;
  }, [autoExpand]);

  const handleBlockBlur = React.useCallback(() => {
    const dialog = ref.current?.closest('[role="dialog"]');
    if (dialog) return;

    setForceUpdate((prev) => {
      return prev + 1;
    });
  }, []);

  React.useEffect(() => {
    if (!ref.current || !refUid) return;
    const generation = ++renderGenerationRef.current;
    renderRoamBlock({
      containerEl: ref.current,
      uid: refUid,
      autoExpandRef,
      onRenderComplete,
      handleBlockBlur,
      setRenderedBlockElm,
      observerRef,
      registeredTextareasRef,
      renderGenerationRef,
      expectedGeneration: generation,
    });
  }, [refUid, handleBlockBlur, onRenderComplete]);

  React.useEffect(() => {
    if (!ref.current || !refUid) return;

    const generation = ++renderGenerationRef.current;

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
          renderGenerationRef,
          expectedGeneration: generation,
        }),
      100
    );

    debouncedReRender();

    return () => {
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
  position: relative;
  left: -14px;
  width: calc(100% + 19px);

  & .rm-block-children {
    display: ${(props) => (props.showAnswers && !props.hideChildren ? 'flex' : 'none')};
  }

  & .rm-block-separator {
    min-width: unset;
  }

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
    text: breadcrumb.title || breadcrumb.string,
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
