/**
 * useCardBlock — there is only ONE kind of card.
 *
 * Every card calls this hook with (refUid, session).  The card does not
 * know which queue it sits in.  Normal cards and LBL children are the
 * same thing: a block with a session.
 *
 *   activeCard = useCardBlock(activeUid, activeSession)
 *
 * Architecture invariants:
 *   - algorithm comes from the card's OWN session, never a parent
 *   - showAnswers is per-card (derived + uid-reset override)
 *   - hasCloze starts true (guard preventing SM2 answer flash)
 *
 * fallbackAlgorithm: when the card has no session (new card), use this
 * instead of DEFAULT_REVIEW_CONFIG.algorithm.  LBL children without
 * their own session inherit the parent's algorithm this way.
 */
import * as React from 'react';
import useBlockInfo from '~/hooks/useBlockInfo';
import {
  Session,
  SchedulingAlgorithm,
  DEFAULT_REVIEW_CONFIG,
  getSessionAlgorithm,
  isGradingAlgorithm,
} from '~/models/session';

const useCardBlock = (
  refUid: string | undefined,
  session: Session | undefined,
  fallbackAlgorithm?: SchedulingAlgorithm
) => {
  const { blockInfo } = useBlockInfo({ refUid: refUid || '' });
  const hasBlockChildren = !!blockInfo.children && !!blockInfo.children.length;

  // hasCloze is derived from block DATA (not DOM), at the same time and
  // through the same pipeline as hasBlockChildren.  This means both cloze-
  // only cards (no children, just {} in the block text) and child-block
  // cards (hasBlockChildren) follow the identical "data → defaultShowAnswers
  // = false" path.  No dependency on useCloze DOM processing for the
  // decision — useCloze only handles the visual <span> wrapping.
  //
  // Cloze pattern: {any text}
  const hasCloze = hasBlockChildren || /\{.+?\}/.test(blockInfo.string || '');

  // Stable noop — hasCloze is purely derived, no longer driven by useCloze
  // DOM callbacks.  Kept for API compatibility with CardBlock / useCloze.
  const setHasCloze = React.useCallback(() => {}, []);

  // Algorithm from the card's OWN session, not a parent.
  // If no session, use the provided fallback (or global default).
  const algorithm = React.useMemo<SchedulingAlgorithm>(
    () => getSessionAlgorithm(session, fallbackAlgorithm ?? DEFAULT_REVIEW_CONFIG.algorithm),
    [session, fallbackAlgorithm]
  );

  // Derive the default answer visibility for this specific card.
  const defaultShowAnswers = React.useMemo(() => {
    if (!isGradingAlgorithm(algorithm)) return true;
    if (hasCloze) return false;
    return true;
  }, [algorithm, hasCloze]);

  // Per-card showAnswers override ("Show Answer" click), keyed by refUid.
  //
  // BUG WARNING — DO NOT USE a single useState + useEffect reset:
  //   A single state (showAnswersOverride) persists across card changes.
  //   Using useEffect(() => setShowAnswersOverride(false), [refUid]) would
  //   reset it AFTER the first render of the new card, not BEFORE.  The
  //   old card's override would briefly apply to the new card, causing a
  //   one-frame flash where SM2 answers expand before hiding, or where a
  //   Progressive card briefly shows an SM2 answer-state.
  //
  // Fix: key the override by refUid so each card starts with a clean slate
  // synchronously.  No effect-based reset needed.
  const [overrideMap, setOverrideMap] = React.useState<Record<string, boolean>>({});

  const setShowAnswers = React.useCallback((show: boolean) => {
    if (!refUid) return;
    setOverrideMap((prev) => {
      // Return same reference when unchanged → no extra render
      if (prev[refUid] === show) return prev;
      return { ...prev, [refUid]: show };
    });
  }, [refUid]);

  const showAnswersOverride = refUid ? (overrideMap[refUid] ?? false) : false;
  const showAnswers = showAnswersOverride || defaultShowAnswers;

  return {
    blockInfo,
    hasBlockChildren,
    hasCloze,
    setHasCloze,
    showAnswers,
    setShowAnswers,
    algorithm,
  };
};

export default useCardBlock;
