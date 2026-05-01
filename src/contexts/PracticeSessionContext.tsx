import * as React from 'react';
import { Settings } from '~/hooks/useSettings';
import { Records } from '~/models/session';
import { Today } from '~/models/practice';
import { handlePracticeProps } from '~/app';
import { useSafeContext } from '~/hooks/useSafeContext';

export interface PracticeSessionContextValue {
  settings: Settings;
  practiceData: Records;
  today: Today;
  selectedTag: string;
  tagsList: string[];
  isCramming: boolean;
  setIsCramming: (_isCramming: boolean) => void;
  handlePracticeClick: (_props: handlePracticeProps) => void;
  handleMemoTagChange: (_tag: string) => void;
  fetchPracticeData: () => void;
  dataPageTitle: string;
  updateSetting: <K extends keyof Settings>(_key: K, _value: Settings[K]) => void;
}

export const PracticeSessionContext = React.createContext<PracticeSessionContextValue | undefined>(
  undefined
);

interface PracticeSessionProviderProps {
  settings: Settings;
  practiceData: Records;
  today: Today;
  selectedTag: string;
  tagsList: string[];
  isCramming: boolean;
  setIsCramming: (_isCramming: boolean) => void;
  handlePracticeClick: (_props: handlePracticeProps) => void;
  handleMemoTagChange: (_tag: string) => void;
  fetchPracticeData: () => void;
  dataPageTitle: string;
  updateSetting: <K extends keyof Settings>(_key: K, _value: Settings[K]) => void;
  children: React.ReactNode;
}

export const PracticeSessionProvider = ({
  settings,
  practiceData,
  today,
  selectedTag,
  tagsList,
  isCramming,
  setIsCramming,
  handlePracticeClick,
  handleMemoTagChange,
  fetchPracticeData,
  dataPageTitle,
  updateSetting,
  children,
}: PracticeSessionProviderProps) => {
  const value = React.useMemo<PracticeSessionContextValue>(
    () => ({
      settings,
      practiceData,
      today,
      selectedTag,
      tagsList,
      isCramming,
      setIsCramming,
      handlePracticeClick,
      handleMemoTagChange,
      fetchPracticeData,
      dataPageTitle,
      updateSetting,
    }),
    [
      settings,
      practiceData,
      today,
      selectedTag,
      tagsList,
      isCramming,
      setIsCramming,
      handlePracticeClick,
      handleMemoTagChange,
      fetchPracticeData,
      dataPageTitle,
      updateSetting,
    ]
  );

  return (
    <PracticeSessionContext.Provider value={value}>{children}</PracticeSessionContext.Provider>
  );
};

export const usePracticeSession = (): PracticeSessionContextValue => {
  return useSafeContext(PracticeSessionContext) as PracticeSessionContextValue;
};
