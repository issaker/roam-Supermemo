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

  // hasCloze starts matching whether the card has children.  Cards without
  // children can't contain cloze deletions, so the guard is skipped and
  // SM2 answers show immediately.  Cards with children start guarded
  // (hasCloze=true) until CardBlock confirms no cloze via setHasCloze(false).
  // This prevents the SM2 answer flash: changing init to false would show
  // answers briefly before useCloze hides them.
  const [hasCloze, setHasCloze] = React.useState(hasBlockChildren);
  React.useEffect(() => { setHasCloze(hasBlockChildren); }, [refUid, hasBlockChildren]);

  // Algorithm from the card's OWN session, not a parent.
  // If no session, use the provided fallback (or global default).
  const algorithm = React.useMemo<SchedulingAlgorithm>(
    () => getSessionAlgorithm(session, fallbackAlgorithm ?? DEFAULT_REVIEW_CONFIG.algorithm),
    [session, fallbackAlgorithm]
  );

  // Derive the default answer visibility for this specific card.
  const defaultShowAnswers = React.useMemo(() => {
    if (!isGradingAlgorithm(algorithm)) return true;
    if (hasBlockChildren || hasCloze) return false;
    return true;
  }, [algorithm, hasBlockChildren, hasCloze]);

  // Per-card override ("Show Answer" click).  Reset on card change.
  const [showAnswersOverride, setShowAnswersOverride] = React.useState(false);
  React.useEffect(() => { setShowAnswersOverride(false); }, [refUid]);

  const setShowAnswers = React.useCallback((show: boolean) => {
    setShowAnswersOverride(show);
  }, []);

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
