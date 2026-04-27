/**
 * Today's Review Calculation
 *
 * Computes which cards are due, new, and completed for the current session.
 * Pipeline: initializeToday → calculateCompletedTodayCounts → addNewCards → addDueCards
 *           → calculateCombinedCounts → limitRemainingPracticeData → calculateTodayStatus
 */
import { Records, RecordUid, Session, isSessionMastered } from '~/models/session';
import { CompletionStatus, RenderMode, Today, TodayInitial, sortNormalDueCardUids } from '~/models/practice';
import { generateNewSession } from '~/queries/utils';
import { DeckConfig } from '~/hooks/useSettings';

const fisherYatesShuffle = <T>(array: T[]): T[] => {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

export const initializeToday = ({ tagsList, cachedData, deckConfigs }) => {
  const today: Today = JSON.parse(JSON.stringify(TodayInitial));

  let parsedDeckConfigs: DeckConfig[] = [];
  try {
    parsedDeckConfigs = JSON.parse(deckConfigs);
  } catch {
    parsedDeckConfigs = [];
  }

  for (const tag of tagsList) {
    const cachedTagData = cachedData?.[tag];
    const matchedConfig = parsedDeckConfigs.find((config) => config.name === tag);

    let renderMode: RenderMode;
    if (matchedConfig) {
      renderMode = matchedConfig.swapQA ? RenderMode.AnswerFirst : RenderMode.Normal;
    } else {
      renderMode = cachedTagData?.renderMode || RenderMode.Normal;
    }

    today.tags[tag] = {
      status: CompletionStatus.Unstarted,
      completed: 0,
      due: 0,
      new: 0,
      newUids: [],
      dueUids: [],
      completedUids: [],
      renderMode,
    };
  }

  return today;
};

export const calculateTodayStatus = ({ today, tagsList }) => {
  for (const tag of tagsList) {
    const completed = today.tags[tag].completed;
    const remaining = today.tags[tag].new + today.tags[tag].due;

    if (remaining === 0) {
      today.tags[tag].status = CompletionStatus.Finished;
    } else if (completed > 0) {
      today.tags[tag].status = CompletionStatus.Partial;
    } else {
      today.tags[tag].status = CompletionStatus.Unstarted;
    }
  }

  const completed = today.combinedToday.completed;
  const remaining = today.combinedToday.new + today.combinedToday.due;

  if (remaining === 0) {
    today.combinedToday.status = CompletionStatus.Finished;
  } else if (completed > 0) {
    today.combinedToday.status = CompletionStatus.Partial;
  } else {
    today.combinedToday.status = CompletionStatus.Unstarted;
  }
};

export const calculateCompletedTodayCounts = ({ today, tagsList, sessionData }) => {
  for (const tag of tagsList) {
    let count = 0;
    const now = new Date();
    const completedUids: RecordUid[] = [];

    const currentTagSessionData = sessionData[tag];
    Object.keys(currentTagSessionData).forEach((cardUid) => {
      const cardData = currentTagSessionData[cardUid];
      if (cardData?.isNew) return;
      if (isSessionMastered(cardData, now)) {
        count++;
        completedUids.push(cardUid);
      }
    });

    today.tags[tag] = {
      ...(today.tags[tag] || {}),
      completed: count,
      completedUids,
    };
  }

  return today;
};

export const calculateCombinedCounts = ({ today, tagsList }) => {
  today.combinedToday = {
    status: CompletionStatus.Unstarted,
    due: 0,
    new: 0,
    dueUids: [],
    newUids: [],
    completed: 0,
    completedUids: [],
  };

  for (const tag of tagsList) {
    today.combinedToday.due += today.tags[tag].due;
    today.combinedToday.new += today.tags[tag].new;
    today.combinedToday.dueUids = today.combinedToday.dueUids.concat(today.tags[tag].dueUids);
    today.combinedToday.newUids = today.combinedToday.newUids.concat(today.tags[tag].newUids);
    today.combinedToday.completed += today.tags[tag].completed;
    today.combinedToday.completedUids = today.combinedToday.completedUids.concat(
      today.tags[tag].completedUids
    );
  }
};

export const addNewCards = ({
  today,
  tagsList,
  cardUids,
  pluginPageData,
  shuffleCards,
}: {
  today: Today;
  tagsList: string[];
  cardUids: Record<string, RecordUid[]>;
  pluginPageData: Records;
  shuffleCards: boolean;
}) => {
  for (const currentTag of tagsList) {
    const allSelectedTagCardsUids = cardUids[currentTag];
    let newCardsUids: RecordUid[] = [];

    allSelectedTagCardsUids.forEach((referenceId) => {
      const latestSession = pluginPageData[referenceId] as Session & { isNew?: boolean };
      if (
        !pluginPageData[referenceId] ||
        (latestSession?.isNew && !latestSession?.nextDueDate)
      ) {
        newCardsUids.push(referenceId);
        if (!pluginPageData[referenceId]) {
          pluginPageData[referenceId] = generateNewSession();
        }
      }
    });

    if (shuffleCards) {
      newCardsUids = fisherYatesShuffle(newCardsUids);
    } else {
      newCardsUids.reverse();
    }

    today.tags[currentTag] = {
      ...today.tags[currentTag],
      newUids: newCardsUids,
      new: newCardsUids.length,
    };
  }
};

export const getDueCardUids = (currentTagSessionData: Records, isCramming, shuffleCards = false) => {
  if (!Object.keys(currentTagSessionData).length) return [];

  return sortNormalDueCardUids(currentTagSessionData, {
    isCramming,
    shuffle: shuffleCards,
    shuffleFn: fisherYatesShuffle,
  });
};

export const addDueCards = ({ today, tagsList, sessionData, isCramming, shuffleCards }) => {
  for (const currentTag of tagsList) {
    const currentTagSessionData = sessionData[currentTag];
    const dueCardsUids = getDueCardUids(currentTagSessionData, isCramming, shuffleCards);

    today.tags[currentTag] = {
      ...today.tags[currentTag],
      dueUids: dueCardsUids,
      due: dueCardsUids.length,
    };
  }
};
