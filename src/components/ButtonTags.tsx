import styled from '@emotion/styled';

const ButtonTags = styled.span<{ kind?: 'light' }>`
  display: inline-block;
  text-transform: uppercase;
  font-size: 9px;
  padding: 1px 2px;
  border-radius: 2px;
  top: -0.5px;
  color: currentColor;
  opacity: 0.6;
  background-color: transparent;
`;

export default ButtonTags;
