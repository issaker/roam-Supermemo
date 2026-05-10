import * as React from 'react';
import { Records, RecordUid } from '~/models/session';
import { getChildSessionData } from '~/queries';
import { SessionFacts } from './types';

export const useSessionFacts = (initialData: Records, dataPageTitle: string) => {
  const [facts, setFacts] = React.useState<SessionFacts>({
    latestByUid: initialData,
    pendingByUid: {},
  });

  // 同步 initialData（practiceData）到 facts.latestByUid。
  // initialData 是异步获取的权威数据源，必须在变化时合并到 facts 中，
  // 否则 currentCardData 会是 undefined，导致 Footer 显示完成状态而非按钮。
  // 使用 isFirstRenderRef 跳过首次渲染（useState 初始值已处理），
  // 后续变化时合并数据。
  const isFirstRenderRef = React.useRef(true);
  React.useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    if (Object.keys(initialData).length === 0) return;
    setFacts((prev) => {
      const merged = { ...prev.latestByUid, ...initialData };
      if (Object.keys(prev.latestByUid).length === Object.keys(merged).length) {
        let changed = false;
        for (const key of Object.keys(initialData)) {
          if (prev.latestByUid[key] !== initialData[key]) {
            changed = true;
            break;
          }
        }
        if (!changed) return prev;
      }
      return { ...prev, latestByUid: merged };
    });
  }, [initialData]);

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
