/**
 * review-runtime selectors
 *
 * Used for DISPLAY state (deckSnapshot) and utility queries.
 * Queue derivation is handled by the queue sync logic in
 * useReviewRuntime.ts — completed cards are removed on data refresh.
 */
import { sortNormalDueCardUids, Today } from '~/models/practice';
import { isSessionMastered, Records, RecordUid, Session } from '~/models/session';
import * as dateUtils from '~/utils/date';
import { DeckSnapshot, SessionFacts } from './types';

const EMPTY_TAG: Today['tags'][string] = {
  status: undefined as never,
  completed: 0,
  due: 0,
  new: 0,
  newUids: [],
  dueUids: [],
  completedUids: [],
  renderMode: undefined as never,
};

const unique = <T>(items: T[]): T[] => Array.from(new Set(items));

const getTodayTagSnapshot = (today: Today, selectedTag: string): Today['tags'][string] =>
  today.tags[selectedTag] || EMPTY_TAG;

export const deriveDeckSnapshot = ({
  today,
  selectedTag,
  latestByUid,
  isCramming,
}: {
  today: Today;
  selectedTag: string;
  latestByUid: Records;
  isCramming: boolean;
}): DeckSnapshot => {
  const todayTag = getTodayTagSnapshot(today, selectedTag);
  const candidateUids = unique([
    ...(todayTag.dueUids || []),
    ...(todayTag.newUids || []),
    ...(todayTag.completedUids || []),
  ]);

  const newUids = (todayTag.newUids || []).filter((uid) => {
    const session = latestByUid[uid] as Session & { isNew?: boolean };
    return Boolean(session?.isNew);
  });

  const sortableDueRecords = candidateUids.reduce((acc, uid) => {
    const session = latestByUid[uid] as Session & { isNew?: boolean };
    if (!session || session.isNew) {
      return acc;
    }
    acc[uid] = session;
    return acc;
  }, {} as Records);

  const dueUids = sortNormalDueCardUids(sortableDueRecords, {
    isCramming,
    shuffle: false,
  });

  const now = new Date();
  const completedUids = candidateUids.filter((uid) => {
    const session = latestByUid[uid] as Session & { isNew?: boolean };
    if (!session || session.isNew || !session.dateCreated) {
      return false;
    }
    return dateUtils.isSameDay(session.dateCreated, now) && isSessionMastered(session, now);
  });

  return {
    candidateUids,
    dueUids,
    newUids,
    completedUids,
    availablePrimaryQueue: [...dueUids, ...newUids],
    statusSummary: {
      due: dueUids.length,
      new: newUids.length,
      completed: completedUids.length,
    },
    renderMode: todayTag.renderMode,
    status: todayTag.status,
  };
};

export const deriveChildSessionMap = ({
  childUidsList,
  facts,
}: {
  childUidsList: string[];
  facts: SessionFacts['latestByUid'];
}) =>
  childUidsList.reduce((acc, uid) => {
    const session = facts[uid];
    if (session) {
      acc[uid] = session as Session;
    }
    return acc;
  }, {} as Record<RecordUid, Session>);
