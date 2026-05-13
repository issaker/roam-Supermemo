import * as React from 'react';
import { Settings } from '~/hooks/useSettings';
import { Records } from '~/models/session';
import { TagCardSets } from '~/models/practice';
import { useSafeContext } from '~/hooks/useSafeContext';

export type LiveTagCardCounts = Record<string, { dueCount: number; newCount: number }>;

export interface PracticeSessionContextValue {
  settings: Settings;
  practiceData: Records;
  tagCardSets: TagCardSets;
  selectedTag: string;
  tagsList: string[];
  isCramming: boolean;
  setIsCramming: (_isCramming: boolean) => void;
  handleMemoTagChange: (_tag: string) => void;
  fetchPracticeData: () => void;
  dataPageTitle: string;
  updateSetting: <K extends keyof Settings>(_key: K, _value: Settings[K]) => void;
  liveTagCardCounts?: LiveTagCardCounts;
}

export const PracticeSessionContext = React.createContext<PracticeSessionContextValue | undefined>(
  undefined
);

type PracticeSessionProviderProps = PracticeSessionContextValue & {
  children: React.ReactNode;
};

export const PracticeSessionProvider = ({
  settings,
  practiceData,
  tagCardSets,
  selectedTag,
  tagsList,
  isCramming,
  setIsCramming,
  handleMemoTagChange,
  fetchPracticeData,
  dataPageTitle,
  updateSetting,
  liveTagCardCounts,
  children,
}: PracticeSessionProviderProps) => {
  const value = React.useMemo<PracticeSessionContextValue>(
    () => ({
      settings,
      practiceData,
      tagCardSets,
      selectedTag,
      tagsList,
      isCramming,
      setIsCramming,
      handleMemoTagChange,
      fetchPracticeData,
      dataPageTitle,
      updateSetting,
      liveTagCardCounts,
    }),
    [
      settings,
      practiceData,
      tagCardSets,
      selectedTag,
      tagsList,
      isCramming,
      setIsCramming,
      handleMemoTagChange,
      fetchPracticeData,
      dataPageTitle,
      updateSetting,
      liveTagCardCounts,
    ]
  );

  return (
    <PracticeSessionContext.Provider value={value}>{children}</PracticeSessionContext.Provider>
  );
};

export const usePracticeSession = (): PracticeSessionContextValue => {
  return useSafeContext(PracticeSessionContext) as PracticeSessionContextValue;
};
