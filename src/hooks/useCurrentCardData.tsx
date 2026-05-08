/**
 * useCurrentCardData Hook
 *
 * Provides card data for the currently displayed card in the practice overlay.
 *
 * Architecture:
 * - `currentCardData` is a direct alias of `latestSession` (not state) so
 *   undo / fetchPracticeData updates are reflected immediately.
 * - `cardMeta` is derived from `latestSession` with an optional uid-keyed
 *   optimistic overlay.  The uid guard prevents the previous card's optimistic
 *   algorithm / interaction from leaking into the next card on the first render.
 */
import * as React from 'react';
import {
  CardMeta,
  Session,
  DEFAULT_REVIEW_CONFIG,
  SchedulingAlgorithm,
  InteractionStyle,
} from '~/models/session';

export default function useCurrentCardData({
  currentCardRefUid,
  sessions,
}: {
  currentCardRefUid: string | undefined;
  sessions: Session[];
}) {
  const latestSession = sessions[sessions.length - 1] as Session | undefined;

  // Direct alias — not state.  Always reflects the freshest session data.
  const currentCardData = latestSession;

  // ARCHITECTURE NOTE — optimisticCardMeta intentionally duplicates cardMeta
  // for optimistic UI during config changes. The single source of truth is
  // facts.latestByUid, and derivedCardMeta already picks up changes from
  // upsertLatestSession. This overlay exists for the brief window between
  // the UI action and the facts state update. If removing, verify that:
  //   1. updateReviewConfigAction in useReviewRuntime still updates facts
  //      before any async operation (it does via upsertLatestSession)
  //   2. The uid guard prevents the previous card's stale meta from
  //      leaking into the next card's first render
  // Keyed by card uid so the synchronous uid guard below ignores stale
  // overrides from the previous card on the same render.
  const [optimisticCardMeta, setOptimisticCardMeta] = React.useState<{
    meta: CardMeta;
    uid: string;
  } | null>(null);

  // Clear optimistic meta when the card changes (runs after paint — the
  // synchronous uid guard in effectiveOptimisticMeta handles first-render
  // correctness).
  React.useEffect(() => {
    if (optimisticCardMeta && optimisticCardMeta.uid !== currentCardRefUid) {
      setOptimisticCardMeta(null);
    }
  }, [currentCardRefUid, optimisticCardMeta]);

  const derivedCardMeta = React.useMemo<CardMeta | undefined>(() => {
    if (!latestSession) return undefined;
    return {
      algorithm: latestSession.algorithm ?? DEFAULT_REVIEW_CONFIG.algorithm,
      interaction: latestSession.interaction ?? DEFAULT_REVIEW_CONFIG.interaction,
      nextDueDate: latestSession.nextDueDate,
    };
  }, [latestSession]);

  // Only apply the optimistic overlay when it belongs to the current card.
  const effectiveOptimisticMeta =
    optimisticCardMeta && optimisticCardMeta.uid === currentCardRefUid
      ? optimisticCardMeta.meta
      : undefined;

  const cardMeta = React.useMemo<CardMeta | undefined>(() => {
    if (!derivedCardMeta && !effectiveOptimisticMeta) return undefined;
    return {
      ...(derivedCardMeta || {}),
      ...(effectiveOptimisticMeta || {}),
      algorithm:
        effectiveOptimisticMeta?.algorithm ??
        derivedCardMeta?.algorithm ??
        DEFAULT_REVIEW_CONFIG.algorithm,
      interaction:
        effectiveOptimisticMeta?.interaction ??
        derivedCardMeta?.interaction ??
        DEFAULT_REVIEW_CONFIG.interaction,
      nextDueDate: effectiveOptimisticMeta?.nextDueDate ?? derivedCardMeta?.nextDueDate,
    };
  }, [derivedCardMeta, effectiveOptimisticMeta]);

  const algorithm = React.useMemo<SchedulingAlgorithm>(() => {
    if (cardMeta?.algorithm) return cardMeta.algorithm;
    if (latestSession?.algorithm) return latestSession.algorithm;
    return DEFAULT_REVIEW_CONFIG.algorithm;
  }, [cardMeta, latestSession]);

  const interaction = React.useMemo<InteractionStyle>(() => {
    if (cardMeta?.interaction) return cardMeta.interaction;
    if (latestSession?.interaction) return latestSession.interaction;
    return DEFAULT_REVIEW_CONFIG.interaction;
  }, [cardMeta, latestSession]);

  const applyOptimisticCardMeta = React.useCallback(
    (newMeta: CardMeta) => {
      if (!currentCardRefUid) return;
      const resolvedAlgorithm = newMeta.algorithm ?? DEFAULT_REVIEW_CONFIG.algorithm;
      const resolvedInteraction = newMeta.interaction ?? DEFAULT_REVIEW_CONFIG.interaction;
      setOptimisticCardMeta({
        meta: { ...newMeta, algorithm: resolvedAlgorithm, interaction: resolvedInteraction },
        uid: currentCardRefUid,
      });
    },
    [currentCardRefUid]
  );

  return {
    currentCardData,
    cardMeta,
    algorithm,
    interaction,
    latestSession,
    applyOptimisticCardMeta,
  };
}
