import styled from '@emotion/styled';

export const SelectorItemBase = styled.div<{ active: boolean }>`
  position: relative;
  user-select: none;
  cursor: pointer;
  border-radius: 2px;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: currentColor;
    opacity: ${({ active }) => (active ? 0.08 : 0)};
    border-radius: 2px;
    pointer-events: none;
  }

  &:hover::before {
    opacity: ${({ active }) => (active ? 0.12 : 0.06)};
  }
`;
