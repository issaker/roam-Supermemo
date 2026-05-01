import { AlgorithmContext, AlgorithmContextValue } from '~/contexts/AlgorithmContext';
import { useSafeContext } from '~/hooks/useSafeContext';

export const useAlgorithmContext = (): AlgorithmContextValue =>
  useSafeContext(AlgorithmContext) as AlgorithmContextValue;
