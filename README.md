# Supermemo - Spaced Repetition for Roam

A spaced repetition plugin for [Roam Research](https://roamresearch.com). Three algorithms: SM2, Progressive, Fixed Time.

![Demo Preview](https://user-images.githubusercontent.com/1279335/189250105-656e6ba3-7703-46e6-bc71-ee8c5f3e39ab.gif)

## Install

**Option 1 — `roam/js`**: Paste into a `{{[[roam/js]]}}` block:
```javascript
if (!window.roamSupermemoLoaded) {
  window.roamSupermemoLoaded = true;
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/gh/issaker/roam-Supermemo-release@main/standalone.js';
  s.onload = () => window.RoamSupermemo?.onload({ extensionAPI: window.roamAlphaAPI });
  document.head.appendChild(s);
}
```

**Option 2 — Extension Settings**: Download `extension.js` from this repo, then add it in Roam's Settings → Extensions.

## Usage

1. Tag a block with `#memo` (or your custom deck tag)
2. Click "Review" in the sidebar, or use Command Palette (`Cmd/Ctrl+P` → "Memo: Start Review Session")
3. Review cards — press `Space` to show answer, then grade

**Normal mode**: child blocks are hidden answers, revealed on "Show Answer".
**Swap Q/A mode**: answers shown first, question hidden until "Show Answer".
**Line-by-Line (LBL) mode**: child blocks revealed one at a time top-to-bottom. ▲/▼ buttons available even when answers are hidden.

## Shortcuts

| Action | Key |
|--------|-----|
| Show Answer / Perfect (SM2) / Next (Progressive/Fixed) | `Space` |
| Forgot / Hard / Good (SM2 only) | `F` `H` `G` |
| Next card | `→` |
| Previous card | `←` |
| Previous / Next line (LBL) | `↑` `↓` |
| Edit interval (Fixed Time) | `E` |
| Toggle breadcrumbs | `B` |
| Close overlay | `Esc` |

## Settings

Open settings via the ⚙ gear icon in the review overlay header. Changes apply on "Apply & Restart".

**Tag Pages (Decks)**: Table-based deck management. Each deck has a name, Swap Q/A toggle, and Weight %. Add (+), remove (−), and reorder (↑↓) decks via action buttons. Weights auto-redistribute on change and always sum to 100%. Set a deck's weight to 0 to disable its review quota.

**DailyNote Deck**: Toggle via "Enable DailyNote Deck" checkbox. Aggregates all top-level blocks from your Daily Notes pages into a special deck (shown with 📅 icon in the deck selector).

**Daily Review Limit**: Number of cards per day (0 = unlimited). When set, each deck receives a proportional share based on its Weight %.

**Reinsert "Forgot" Cards After N Cards**: When you mark a card as "Forgot", it reappears N cards later. Set to 0 to disable.

**Reinsert "LBL Next" Cards After N Cards**: When you click "Next" on an LBL + Progressive/Fixed card, it reappears N cards later. Set to 0 to review all lines consecutively (like SM2 LBL mode).

**Data Page Title**: Roam page name for storing all plugin data (default: `roam/Supermemo`).

**Auto Collapse Blocks After Review**: Automatically collapse reviewed blocks on the Roam page. In LBL mode, only the current sub-block stays expanded.

**Show Review Mode Borders**: Color-coded dialog border per algorithm — green=SM2, orange=Progressive, blue=Fixed Time.

**Shuffle Cards**: OFF → due cards sorted by urgency (most overdue → hardest → least mature), new cards in reverse creation order. ON → all cards randomly shuffled.

**Right-to-Left (RTL) Enabled**: Enable RTL layout for Arabic, Hebrew, etc.

## In-Review Controls

**Algorithm Selector**: Dropdown in the footer to change the current card's algorithm on the fly (SM2 / Progressive / Fixed Time). Persists to the data page.

**Interaction Selector**: Dropdown in the footer to change the current card's interaction mode (Normal / Line by Line). Persists to the data page.

**Undo Learning**: When a card is already learned today, an "Undo Learning" button appears to reset its scheduling record.

**Cram**: After finishing all due cards, click "Continue Cramming" to review cards without affecting scheduling. A "Cramming" badge appears in the header.

**Breadcrumbs**: Toggle page hierarchy display via the 👁 eye icon in the header or the `B` key.

## Cloze Deletion

Use `{hide me}` curly braces to create cloze deletions. Text inside `{}` is masked when answers are hidden and revealed on "Show Answer". Roam's native `^^highlight^^` is NOT treated as cloze.

## Privacy

All data stored in your Roam graph. No external requests.
