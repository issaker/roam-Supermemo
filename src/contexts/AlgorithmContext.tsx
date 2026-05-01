import * as React from 'react';
import { SchedulingAlgorithm, InteractionStyle } from '~/models/session';

export interface AlgorithmContextValue {
  algorithm?: SchedulingAlgorithm;
  interaction?: InteractionStyle;
  onSelectAlgorithm: (_algorithm: SchedulingAlgorithm) => void;
  onSelectInteraction: (_interaction: InteractionStyle) => void;
}

export const AlgorithmContext = React.createContext<AlgorithmContextValue | undefined>(undefined);

interface AlgorithmProviderProps {
  algorithm?: SchedulingAlgorithm;
  interaction?: InteractionStyle;
  onSelectAlgorithm: (_algorithm: SchedulingAlgorithm) => void;
  onSelectInteraction: (_interaction: InteractionStyle) => void;
  children: React.ReactNode;
}

export const AlgorithmProvider = ({
  algorithm,
  interaction,
  onSelectAlgorithm,
  onSelectInteraction,
  children,
}: AlgorithmProviderProps) => {
  const value = React.useMemo<AlgorithmContextValue>(
    () => ({
      algorithm,
      interaction,
      onSelectAlgorithm,
      onSelectInteraction,
    }),
    [algorithm, interaction, onSelectAlgorithm, onSelectInteraction]
  );

  return <AlgorithmContext.Provider value={value}>{children}</AlgorithmContext.Provider>;
};
