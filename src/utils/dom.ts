/**
 * DOM Utilities
 *
 * simulateMouseClick: Dispatches a full mouse click event sequence
 * (mouseenter → mouseover → mousedown → click → mouseup)
 * Used to programmatically interact with Roam's DOM elements
 * (e.g., expanding collapsed blocks where no API exists)
 */
export const simulateMouseEvents = (element, events: string[] = []) => {
  events.forEach((mouseEventType) =>
    element.dispatchEvent(
      new MouseEvent(mouseEventType, {
        view: window,
        bubbles: true,
        cancelable: true,
        buttons: 1,
      })
    )
  );
};
export const simulateMouseClick = (element) => {
  const mouseClickEvents = ['mouseenter', 'mouseover', 'mousedown', 'click', 'mouseup'];
  simulateMouseEvents(element, mouseClickEvents);
};

export const collapseBlockOnPage = async (uid: string) => {
  try {
    await window.roamAlphaAPI.updateBlock({
      block: { uid, open: false },
    });
  } catch {
    const textareas = Array.from(document.querySelectorAll(`textarea[id="${uid}"]`));
    for (const textarea of textareas) {
      if (textarea.closest('[role="dialog"]')) continue;
      const block = textarea.closest('.rm-block');
      if (!block) continue;
      const caret = block.querySelector('.rm-caret-open');
      if (caret) simulateMouseClick(caret);
    }
  }
};
