import * as React from 'react';
import { Breadcrumbs as BreadcrumbsType } from '~/queries';
import styled from '@emotion/styled';
import { Icon } from '@blueprintjs/core';
import useCloze from '~/hooks/useCloze';
import { colors } from '~/theme';

const expandedBlockOriginalStates = new Map<string, boolean>();

const expandBlock = async (uid: string) => {
  try {
    const blockData = window.roamAlphaAPI.pull('[:block/open]', [':block/uid', uid]);
    if (blockData && blockData[':block/open'] === false) {
      await window.roamAlphaAPI.updateBlock({
        block: { uid, open: true },
      });
      expandedBlockOriginalStates.set(uid, false);
    }
  } catch (err) {
    console.error('Memo: Failed to expand block', err);
  }
};

export const restoreBlock = async (uid: string) => {
  const originalOpen = expandedBlockOriginalStates.get(uid);
  if (originalOpen !== undefined) {
    try {
      await window.roamAlphaAPI.updateBlock({
        block: { uid, open: originalOpen },
      });
      expandedBlockOriginalStates.delete(uid);
    } catch (err) {
      console.error('Memo: Failed to restore block', err);
    }
  }
};

export const restoreAllBlocks = async () => {
  const uids = Array.from(expandedBlockOriginalStates.keys());
  await Promise.all(uids.map((uid) => restoreBlock(uid)));
};

const renderRoamBlock = async ({
  containerEl,
  uid,
  onRenderComplete,
  handleBlockBlur,
  setRenderedBlockElm,
  observerRef,
  registeredTextareasRef,
  renderGenerationRef,
  expectedGeneration,
  skipExpand,
}: {
  containerEl: HTMLElement;
  uid: string;
  onRenderComplete?: () => void;
  handleBlockBlur: () => void;
  setRenderedBlockElm: (el: HTMLElement | null) => void;
  observerRef: React.MutableRefObject<MutationObserver | null>;
  registeredTextareasRef: React.MutableRefObject<Set<HTMLTextAreaElement>>;
  renderGenerationRef: React.MutableRefObject<number>;
  expectedGeneration: number;
  skipExpand?: boolean;
}) => {
  const isStale = () => renderGenerationRef.current !== expectedGeneration;

  try {
    if (!skipExpand) {
      await expandBlock(uid);
    } else {
      await restoreBlock(uid);
    }
    if (isStale()) return;

    await window.roamAlphaAPI.ui.components.unmountNode({ el: containerEl });
    if (isStale()) return;

    await window.roamAlphaAPI.ui.components.renderBlock({ uid, el: containerEl });
    if (isStale()) return;

    const roamBlockElm = containerEl.querySelector('.rm-block') as HTMLElement | null;
    if (isStale()) return;
    setRenderedBlockElm(roamBlockElm);

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
  skipExpand,
}: {
  refUid: string;
  showAnswers: boolean;
  breadcrumbs: BreadcrumbsType[];
  showBreadcrumbs: boolean;
  onRenderComplete?: () => void;
  hideChildren?: boolean;
  skipExpand?: boolean;
}) => {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [renderedBlockElm, setRenderedBlockElm] = React.useState<HTMLElement | null>(null);
  useCloze({ renderedBlockElm: renderedBlockElm as HTMLElement });

  const [forceUpdate, setForceUpdate] = React.useState(0);

  const refUidRef = React.useRef(refUid);
  const prevRefUidForRestoreRef = React.useRef<string | undefined>(undefined);

  React.useEffect(() => {
    if (prevRefUidForRestoreRef.current && prevRefUidForRestoreRef.current !== refUid) {
      restoreBlock(prevRefUidForRestoreRef.current);
    }
    prevRefUidForRestoreRef.current = refUid;
    return () => {
      if (prevRefUidForRestoreRef.current) {
        restoreBlock(prevRefUidForRestoreRef.current);
      }
    };
  }, [refUid]);

  const observerRef = React.useRef<MutationObserver | null>(null);

  const registeredTextareasRef = React.useRef<Set<HTMLTextAreaElement>>(new Set());

  const renderGenerationRef = React.useRef(0);

  const handleBlockBlur = React.useCallback(() => {
    const dialog = ref.current?.closest('[role="dialog"]');
    if (dialog) return;

    setForceUpdate((prev) => {
      return prev + 1;
    });
  }, []);

  // 单一渲染 effect：合并原双 effect，消除 generation 计数器竞态
  // 原双 effect 各自递增 renderGenerationRef，初始挂载时 Effect 2 的递增
  // 会使 Effect 1 的 renderRoamBlock 在 unmountNode 后被标记为过期而退出，
  // 导致容器清空但未渲染（只有面包屑显示的 bug）。
  // 合并后每次 effect 执行只递增一次 generation，且通过条件防抖保留原语义：
  // refUid 变化时立即渲染，其余变化（forceUpdate）时 100ms 防抖。
  React.useEffect(() => {
    if (!ref.current || !refUid) return;

    const isCardChange = refUid !== refUidRef.current;
    refUidRef.current = refUid;
    const generation = ++renderGenerationRef.current;

    const doRender = () => {
      renderRoamBlock({
        containerEl: ref.current!,
        uid: refUidRef.current,
        onRenderComplete,
        handleBlockBlur,
        setRenderedBlockElm,
        observerRef,
        registeredTextareasRef,
        renderGenerationRef,
        expectedGeneration: generation,
        skipExpand,
      });
    };

    let cancelled = false;

    if (isCardChange) {
      doRender();
    } else {
      const timer = setTimeout(doRender, 100);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }

    return () => {
      if (cancelled) return;
      registeredTextareasRef.current.forEach((textarea) => {
        textarea.removeEventListener('blur', handleBlockBlur);
      });
      registeredTextareasRef.current = new Set();

      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, [refUid, forceUpdate, handleBlockBlur, onRenderComplete, skipExpand]);

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
  margin-left: 22px !important;
  margin-top: -4px !important;

  &.rm-zoom-item {
    cursor: auto !important;
  }
`;

export default React.memo(CardBlock);
