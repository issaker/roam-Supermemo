/**
 * Style injection module — fixes z-index stacking for Roam Research image hover popups.
 */

const STYLE_ID = 'roam-Supermemo-z-index-fix';

const zIndexFixCSS = `
/* Lower the practice dialog portal z-index so Roam image popups can appear above it */
/* Using :has() selector for specificity — targets portals containing our dialog footer */
.bp3-portal:has(.bp3-overlay.bp3-overlay-open):has(.bp3-multistep-dialog-log-footer),
.bp3-portal:has(.bp3-overlay.bp3-overlay-open):has(.bp3-multistep-dialog-footer) {
  z-index: 1 ;
}

/* Raise the Roam image modal portal z-index above everything */
#rm-modal-portal {
  z-index: 2 ;
}
`;

export const injectZIndexFixStyles = (): void => {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const styleElement = document.createElement('style');
  styleElement.id = STYLE_ID;
  styleElement.textContent = zIndexFixCSS;

  document.head.appendChild(styleElement);
};

export const removeZIndexFixStyles = (): void => {
  const styleElement = document.getElementById(STYLE_ID);
  if (styleElement) {
    styleElement.remove();
  }
};