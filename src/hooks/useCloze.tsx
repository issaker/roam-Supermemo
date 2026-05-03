import * as React from 'react';

function getAllTextNodes(element: Element) {
  return Array.from(element.childNodes).filter(
    (node) => node.nodeType === 3 && node.textContent && node.textContent.trim().length > 1
  );
}

function wrapMatches(node: Element, regex: RegExp) {
  const textNodes = getAllTextNodes(node);

  for (let i = 0; i < textNodes.length; ) {
    const textNode = textNodes[i];
    const text = textNode.textContent;

    if (!text) {
      i++;
      continue;
    }

    regex.lastIndex = 0;
    const match = regex.exec(text);

    if (match) {
      const matchedText = match[0];
      const matchedTextStart = match.index;
      const matchedTextEnd = matchedTextStart + matchedText.length;
      const beforeText = text.slice(0, matchedTextStart);
      const afterText = text.slice(matchedTextEnd);

      const clozeElm = document.createElement('span');
      clozeElm.classList.add('roam-Supermemo-cloze');
      clozeElm.textContent = matchedText;

      const beforeElm = document.createTextNode(beforeText);
      const afterElm = document.createTextNode(afterText);

      if (textNode.parentNode) {
        textNode.parentNode.insertBefore(beforeElm, textNode);
        textNode.parentNode.insertBefore(clozeElm, textNode);
        textNode.parentNode.insertBefore(afterElm, textNode);
        textNode.parentNode.removeChild(textNode);
      }
      textNodes.splice(i, 1, beforeElm, afterElm);
      i++;
    } else {
      i++;
    }
  }
}

const useCloze = ({ renderedBlockElm }: {
  renderedBlockElm: HTMLElement;
}) => {
  React.useEffect(() => {
    if (!renderedBlockElm) return;

    const mainBlockElm = renderedBlockElm.querySelector(
      '.rm-block-main .dont-unfocus-block span'
    );
    if (!mainBlockElm) return;

    const re = new RegExp(`{(.+?)}`, 'gs');
    wrapMatches(mainBlockElm, re);
  }, [renderedBlockElm]);
};

export default useCloze;
