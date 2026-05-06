import { Records, RecordUid, Session, classifyCard } from '~/models/session';
import { RenderMode, sortNormalDueCardUids, TagCardSets } from '~/models/practice';
import { generateNewSession } from '~/queries/utils';
import { parseDeckConfigs } from '~/utils/deckConfig';

const buildChildSessionMap = (
  childUids: string[],
  pluginPageData: Records
): Record<string, Session | undefined> => {
  const map: Record<string, Session | undefined> = {};
  for (const uid of childUids) map[uid] = pluginPageData[uid] as Session | undefined;
  return map;
};

const fisherYatesShuffle = <T>(array: T[]): T[] => {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

export const classifyAllCards = ({
  tagsList,
  sessionData: _sessionData,
  cardUids,
  pluginPageData,
  lblDeckMeta,
  deckConfigs,
  cachedData,
  shuffleCards,
}: {
  tagsList: string[];
  sessionData: Record<string, Records>;
  cardUids: Record<string, RecordUid[]>;
  pluginPageData: Records;
  lblDeckMeta: Record<string, string[]>;
  deckConfigs: string;
  cachedData: Record<string, any>;
  shuffleCards: boolean;
}): TagCardSets => {
  const parsedDeckConfigs = parseDeckConfigs(deckConfigs);
  const now = new Date();
  const result: TagCardSets = {};

  for (const tag of tagsList) {
    const cachedTagData = cachedData?.[tag];
    const matchedConfig = parsedDeckConfigs.find((config) => config.name === tag);
    const renderMode: RenderMode = matchedConfig
      ? matchedConfig.swapQA
        ? RenderMode.AnswerFirst
        : RenderMode.Normal
      : cachedTagData?.renderMode || RenderMode.Normal;

    const dueUids: RecordUid[] = [];
    const newUids: RecordUid[] = [];
    const completedUids: RecordUid[] = [];
    const dueRecords: Records = {};

    const tagCardUids = cardUids[tag] || [];
    for (const cardUid of tagCardUids) {
      const session = pluginPageData[cardUid] as Session | undefined;
      const lblChildren = lblDeckMeta[cardUid]
        ? {
            uids: lblDeckMeta[cardUid],
            sessions: buildChildSessionMap(lblDeckMeta[cardUid], pluginPageData),
          }
        : undefined;

      const cls = classifyCard({ session, lblChildren, now });

      if (cls === 'due') {
        dueUids.push(cardUid);
        if (session && !(session as Session & { isNew?: boolean }).isNew) {
          dueRecords[cardUid] = session;
        }
      } else if (cls === 'new') {
        newUids.push(cardUid);
        if (!pluginPageData[cardUid]) {
          pluginPageData[cardUid] = generateNewSession();
        }
      } else if (cls === 'completed') {
        completedUids.push(cardUid);
      }
    }

    const sortedDueUids = sortNormalDueCardUids(dueRecords, {
      shuffle: shuffleCards,
      shuffleFn: fisherYatesShuffle,
    });

    const sortedNewUids = shuffleCards ? fisherYatesShuffle(newUids) : newUids.reverse();

    result[tag] = {
      dueUids: sortedDueUids,
      newUids: sortedNewUids,
      completedUids,
      renderMode,
      lblDeckMeta,
    };
  }

  return result;
};
