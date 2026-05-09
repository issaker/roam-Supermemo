import * as React from 'react';
import { Records, RecordUid } from '~/models/session';
import { getChildSessionData } from '~/queries';
import { SessionFacts } from './types';

export const useSessionFacts = (initialData: Records, dataPageTitle: string) => {
  const [facts, setFacts] = React.useState<SessionFacts>({
    latestByUid: initialData,
    pendingByUid: {},
  });

  const setPendingState = React.useCallback(
    (uid: RecordUid, state: SessionFacts['pendingByUid'][string]) => {
      setFacts((prev) => ({
        ...prev,
        pendingByUid: {
          ...prev.pendingByUid,
          [uid]: state,
        },
      }));
    },
    []
  );

  const upsertLatestSessions = React.useCallback((sessions: Partial<Records>) => {
    setFacts((prev) => ({
      ...prev,
      latestByUid: {
        ...prev.latestByUid,
        ...sessions,
      },
    }));
  }, []);

  const ensureLatestSessions = React.useCallback(
    async (uids: string[]) => {
      if (!uids.length) return {};
      const data = await getChildSessionData({ childUids: uids, dataPageTitle });
      if (Object.keys(data).length) {
        setFacts((prev) => ({
          ...prev,
          latestByUid: {
            ...prev.latestByUid,
            ...data,
          },
        }));
      }
      return data;
    },
    [dataPageTitle]
  );

  return { facts, setPendingState, upsertLatestSessions, ensureLatestSessions };
};
