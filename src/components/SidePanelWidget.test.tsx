import { render, screen, act, within, waitFor } from '@testing-library/react';

import * as testUtils from '~/utils/testUtils';
import * as dateUtils from '~/utils/date';

import App from '~/app';

describe('Side Panel Widget', () => {
  const originalLocation = window;

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: originalLocation,
    });
  });

  it('renders initial state without error', async () => {
    const mockBuilder = new testUtils.MockDataBuilder();
    mockBuilder.mockQueryResults();

    await act(async () => {
      render(<App />);
    });

    expect(screen.getByText('Review')).toBeInTheDocument();
  });

  it('renders completed state when nothing due/new', async () => {
    const mockBuilder = new testUtils.MockDataBuilder();
    mockBuilder.mockQueryResults();

    await act(async () => {
      render(<App />);
    });

    const sidePanelWrapper = screen.getByTestId('side-panel-wrapper');
    expect(sidePanelWrapper).toBeInTheDocument();

    const completedIconClass = '.bp3-icon-confirm';
    const completedIcon = sidePanelWrapper.querySelector(completedIconClass);
    expect(completedIcon).toBeInTheDocument();
  });

  it('renders correct count when new cards added', async () => {
    const uid = 'id_1';
    const mockBuilder = new testUtils.MockDataBuilder().withCard({ uid });
    mockBuilder.mockQueryResults();

    await act(async () => {
      render(<App />);
    });

    const sidePanelWrapper = screen.getByTestId('side-panel-wrapper');
    const incompleteIconClass = '.bp3-icon-box';
    const incompleteIconElement = sidePanelWrapper.querySelector(incompleteIconClass);
    expect(incompleteIconElement).toBeInTheDocument();

    const newTag = screen.getByTestId('new-tag');
    expect(newTag).toBeInTheDocument();
    expect(newTag).toHaveTextContent('1');

    const dueTag = screen.queryByTestId('due-tag');
    expect(dueTag).not.toBeInTheDocument();
  });

  it('renders correct count when new cards added to multile decks', async () => {
    const mockBuilder = new testUtils.MockDataBuilder()
      .withTag('deck-one')
      .withCard({ uid: 'id_1', tag: 'deck-one' })
      .withCard({ uid: 'id_2', tag: 'deck-one' })
      .withTag('deck-two')
      .withCard({ uid: 'id_3', tag: 'deck-two' });
    mockBuilder.mockQueryResults();

    await act(async () => {
      render(<App />);
    });

    const sidePanelWrapper = screen.getByTestId('side-panel-wrapper');
    const incompleteIconClass = '.bp3-icon-box';
    const incompleteIconElement = sidePanelWrapper.querySelector(incompleteIconClass);
    expect(incompleteIconElement).toBeInTheDocument();

    const newTag = screen.getByTestId('new-tag');
    expect(newTag).toBeInTheDocument();
    expect(newTag).toHaveTextContent('3');

    const dueTag = screen.queryByTestId('due-tag');
    expect(dueTag).not.toBeInTheDocument();
  });

  it('renders correct count when with due cards, unstarted', async () => {
    const uid = 'id_1';
    const mockBuilder = new testUtils.MockDataBuilder().withCard({ uid }).withSession(uid, {
      nextDueDate: new Date(),
    });
    mockBuilder.mockQueryResults();

    await act(async () => {
      render(<App />);
    });

    const sidePanelWrapper = screen.getByTestId('side-panel-wrapper');
    const incompleteIconClass = '.bp3-icon-box';
    const incompleteIconElement = sidePanelWrapper.querySelector(incompleteIconClass);
    expect(incompleteIconElement).toBeInTheDocument();

    const dueTag = screen.getByTestId('due-tag');
    expect(dueTag).toBeInTheDocument();
    expect(dueTag).toHaveTextContent('1');

    const newTag = screen.queryByTestId('new-tag');
    expect(newTag).not.toBeInTheDocument();
  });

  it('renders correct count when with due cards, unstarted, multiple decks', async () => {
    const uid = 'id_1';
    const mockBuilder = new testUtils.MockDataBuilder()
      .withCard({ uid })
      .withSession(uid, {
        nextDueDate: new Date(),
      })
      .withTag('deck-one')
      .withCard({ uid: 'id_2', tag: 'deck-one' })
      .withSession('id_2', {
        nextDueDate: new Date(),
      });

    mockBuilder.mockQueryResults();

    await act(async () => {
      render(<App />);
    });

    const sidePanelWrapper = screen.getByTestId('side-panel-wrapper');
    const incompleteIconClass = '.bp3-icon-box';
    const incompleteIconElement = sidePanelWrapper.querySelector(incompleteIconClass);
    expect(incompleteIconElement).toBeInTheDocument();

    const dueTag = screen.getByTestId('due-tag');
    expect(dueTag).toBeInTheDocument();
    expect(dueTag).toHaveTextContent('2');

    const newTag = screen.queryByTestId('new-tag');
    expect(newTag).not.toBeInTheDocument();
  });

  it('decrements count when card completed', async () => {
    const card_1 = 'id_1';
    const card_2 = 'id_2';
    const mockBuilder = new testUtils.MockDataBuilder()
      // Create two cards due today
      .withCard({ uid: card_1 })
      .withCard({ uid: card_2 })
      .withSession(card_1, {
        dateCreated: dateUtils.subtractDays(new Date(), 1),
        nextDueDate: new Date(),
      })
      .withSession(card_2, {
        dateCreated: dateUtils.subtractDays(new Date(), 1),
        nextDueDate: new Date(),
      })
      // Complete one today
      .withSession(card_1, {
        dateCreated: new Date(),
        nextDueDate: dateUtils.addDays(new Date(), 1),
      });

    mockBuilder.mockQueryResults();
    await act(async () => {
      render(<App />);
    });

    const newTag = screen.queryByTestId('new-tag');
    expect(newTag).not.toBeInTheDocument();

    const dueTag = screen.getByTestId('due-tag');
    expect(dueTag).toBeInTheDocument();
    expect(dueTag).toHaveTextContent('1');
  });

  it('can handle case where same card is practiced twice on same day', async () => {
    const card_1 = 'id_1';
    const mockBuilder = new testUtils.MockDataBuilder()
      .withCard({ uid: card_1 })
      .withSession(card_1, {
        dateCreated: dateUtils.subtractDays(new Date(), 1),
        nextDueDate: new Date(),
      })
      .withSession(card_1, {
        dateCreated: new Date(),
        nextDueDate: new Date(),
      })
      .withSession(card_1, {
        dateCreated: new Date(),
        nextDueDate: dateUtils.addDays(new Date(), 2),
      });

    mockBuilder.mockQueryResults();
    await act(async () => {
      render(<App />);
    });

    const newTag = screen.queryByTestId('new-tag');
    expect(newTag).not.toBeInTheDocument();

    const dueTag = screen.queryByTestId('due-tag');
    expect(dueTag).not.toBeInTheDocument();
  });

  it('renders completed state when all new/due cards completed', async () => {
    const dueCard1 = 'id_1';
    const dueCard2 = 'id_2';
    const newCard1 = 'id_3';
    const newCard2 = 'id_4';

    const mockBuilder = new testUtils.MockDataBuilder()
      // Create some cards due today
      .withCard({ uid: dueCard1 })
      .withSession(dueCard1, {
        dateCreated: dateUtils.subtractDays(new Date(), 1),
        nextDueDate: new Date(),
      })
      .withCard({ uid: dueCard2 })
      .withSession(dueCard2, {
        dateCreated: dateUtils.subtractDays(new Date(), 1),
        nextDueDate: new Date(),
      })
      // Create some new cards
      .withCard({ uid: newCard1 })
      .withCard({ uid: newCard2 })
      // Complete all new/due cards
      .withSession(dueCard1, {
        dateCreated: new Date(),
        nextDueDate: dateUtils.addDays(new Date(), 1),
      })
      .withSession(dueCard2, {
        dateCreated: new Date(),
        nextDueDate: dateUtils.addDays(new Date(), 1),
      })
      .withSession(newCard1, {
        dateCreated: new Date(),
        nextDueDate: dateUtils.addDays(new Date(), 1),
      })
      .withSession(newCard2, {
        dateCreated: new Date(),
        nextDueDate: dateUtils.addDays(new Date(), 1),
      });

    mockBuilder.mockQueryResults();

    await act(async () => {
      render(<App />);
    });

    const sidePanelWrapper = screen.getByTestId('side-panel-wrapper');
    expect(sidePanelWrapper).toBeInTheDocument();

    const completedIconClass = '.bp3-icon-confirm';
    const completedIcon = sidePanelWrapper.querySelector(completedIconClass);
    expect(completedIcon).toBeInTheDocument();
  });

  it('renders completed state when all new/due cards completed, multille decks', async () => {
    const dueCard1 = 'id_1';
    const dueCard2 = 'id_2';
    const newCard1 = 'id_3';
    const newCard2 = 'id_4';
    const deckTwo = 'deck-two';

    const mockBuilder = new testUtils.MockDataBuilder()
      // Create some cards due today
      .withCard({ uid: dueCard1 })
      .withSession(dueCard1, {
        dateCreated: dateUtils.subtractDays(new Date(), 1),
        nextDueDate: new Date(),
      })
      .withCard({ uid: dueCard2 })
      .withSession(dueCard2, {
        dateCreated: dateUtils.subtractDays(new Date(), 1),
        nextDueDate: new Date(),
      })
      // Create some new cards on another deck
      .withTag(deckTwo)
      .withCard({ uid: newCard1, tag: deckTwo })
      .withCard({ uid: newCard2, tag: deckTwo })
      // Complete all new/due cards
      .withSession(dueCard1, {
        dateCreated: new Date(),
        nextDueDate: dateUtils.addDays(new Date(), 1),
      })
      .withSession(dueCard2, {
        dateCreated: new Date(),
        nextDueDate: dateUtils.addDays(new Date(), 1),
      })
      .withSession(newCard1, {
        dateCreated: new Date(),
        nextDueDate: dateUtils.addDays(new Date(), 1),
      })
      .withSession(newCard2, {
        dateCreated: new Date(),
        nextDueDate: dateUtils.addDays(new Date(), 1),
      });

    mockBuilder.mockQueryResults();

    await act(async () => {
      render(<App />);
    });

    const sidePanelWrapper = screen.getByTestId('side-panel-wrapper');
    expect(sidePanelWrapper).toBeInTheDocument();

    const completedIconClass = '.bp3-icon-confirm';
    const completedIcon = sidePanelWrapper.querySelector(completedIconClass);
    expect(completedIcon).toBeInTheDocument();
  });

  describe('Daily Limit Set', () => {
    it('Renders correct counts when single deck, with only only new cards', async () => {
      const mockBuilder = new testUtils.MockDataBuilder().withSetting({
        dailyLimit: 5,
      });

      for (let i = 0; i < 10; i++) {
        mockBuilder.withCard({ uid: `id_${i}` });
      }

      mockBuilder.mockQueryResults();

      await act(async () => {
        render(<App />);
      });

      const sidePanelWrapper = screen.getByTestId('side-panel-wrapper');
      const incompleteIconClass = '.bp3-icon-box';
      const incompleteIconElement = sidePanelWrapper.querySelector(incompleteIconClass);
      expect(incompleteIconElement).toBeInTheDocument();

      const newTag = screen.getByTestId('new-tag');
      const dueTag = screen.queryByTestId('due-tag');
      expect(newTag).toHaveTextContent('5');
      expect(dueTag).not.toBeInTheDocument();
    });

    it('Due cards should only make up 25% of daily limit when possible', async () => {
      const newCardCount = 10;
      const dueCardCount = 5;

      const mockBuilder = new testUtils.MockDataBuilder().withSetting({
        dailyLimit: 5,
      });

      // Create some cards new today
      for (let i = 0; i < newCardCount; i++) {
        mockBuilder.withCard({ uid: `id_${i}` });
      }

      // Create some cards due today
      for (let i = newCardCount; i < newCardCount + dueCardCount; i++) {
        mockBuilder.withCard({ uid: `id_${i}` }).withSession(`id_${i}`, {
          dateCreated: dateUtils.subtractDays(new Date(), 1),
          nextDueDate: new Date(),
        });
      }

      mockBuilder.mockQueryResults();

      await act(async () => {
        render(<App />);
      });

      const sidePanelWrapper = screen.getByTestId('side-panel-wrapper');
      const incompleteIconClass = '.bp3-icon-box';
      const incompleteIconElement = sidePanelWrapper.querySelector(incompleteIconClass);
      expect(incompleteIconElement).toBeInTheDocument();

      const newTag = screen.getByTestId('new-tag');
      const dueTag = screen.queryByTestId('due-tag');
      expect(newTag).toHaveTextContent('1'); // Limit new cards to 25% of limit
      expect(dueTag).toHaveTextContent('4');
    });

    it('When not enough due cards to make limit, pulls from new if available', async () => {
      const newCardCount = 10;
      const dueCardCount = 1;

      const mockBuilder = new testUtils.MockDataBuilder().withSetting({
        dailyLimit: 5,
      });

      // Create some cards new today
      for (let i = 0; i < newCardCount; i++) {
        mockBuilder.withCard({ uid: `id_${i}` });
      }

      // Create some cards due today
      for (let i = newCardCount; i < newCardCount + dueCardCount; i++) {
        mockBuilder.withCard({ uid: `id_${i}` }).withSession(`id_${i}`, {
          dateCreated: dateUtils.subtractDays(new Date(), 1),
          nextDueDate: new Date(),
        });
      }

      mockBuilder.mockQueryResults();

      await act(async () => {
        render(<App />);
      });

      const sidePanelWrapper = screen.getByTestId('side-panel-wrapper');
      const incompleteIconClass = '.bp3-icon-box';
      const incompleteIconElement = sidePanelWrapper.querySelector(incompleteIconClass);
      expect(incompleteIconElement).toBeInTheDocument();

      const newTag = screen.getByTestId('new-tag');
      const dueTag = screen.queryByTestId('due-tag');

      expect(newTag).toHaveTextContent('4');
      expect(dueTag).toHaveTextContent('1');
    });

    it('renders correct count new/due count when daily limit set is split between two decks', async () => {
      const dueCard1 = 'id_due_1';
      const dueCard2 = 'id_due_2';
      const newCard1 = 'id_new_3';
      const newCard2 = 'id_new_4';
      const deckTwo = 'deck-two';

      const mockBuilder = new testUtils.MockDataBuilder().withSetting({
        dailyLimit: 2,
      });

      // Add due cards to memo deck
      mockBuilder
        .withCard({ uid: dueCard1, tag: 'memo' })
        .withSession(dueCard1, {
          dateCreated: dateUtils.subtractDays(new Date(), 1),
          nextDueDate: new Date(),
        })
        .withCard({ uid: dueCard2 })
        .withSession(dueCard2, {
          dateCreated: dateUtils.subtractDays(new Date(), 1),
          nextDueDate: new Date(),
        });

      // Create some new cards on another deck
      mockBuilder
        .withTag(deckTwo)
        .withCard({ uid: newCard1, tag: deckTwo })
        .withCard({ uid: newCard2, tag: deckTwo });

      mockBuilder.mockQueryResults();

      await act(async () => {
        render(<App />);
      });

      const sidePanelWrapper = screen.getByTestId('side-panel-wrapper');
      const incompleteIconClass = '.bp3-icon-box';
      const incompleteIconElement = sidePanelWrapper.querySelector(incompleteIconClass);
      expect(incompleteIconElement).toBeInTheDocument();

      const dueTag = screen.getByTestId('due-tag');
      expect(dueTag).toBeInTheDocument();
      expect(dueTag).toHaveTextContent('1');

      const newTag = screen.getByTestId('new-tag');
      expect(newTag).toBeInTheDocument();
      expect(newTag).toHaveTextContent('1');
    });

    it('renders correct count when, limit set, one deck complete, but other deck has due cards', async () => {
      const mockBuilder = new testUtils.MockDataBuilder();

      mockBuilder.withSetting({
        dailyLimit: 5,
      });

      // Add completed deck
      mockBuilder.withCard({ uid: 'memo_1' });

      // Add deck with some new cards
      mockBuilder.withTag('deck-two');
      for (let i = 0; i < 10; i++) {
        mockBuilder.withCard({ uid: `deck_two_${i}`, tag: 'deck-two' });
      }

      mockBuilder.mockQueryResults();

      await act(async () => {
        render(<App />);
      });

      const sidePanelWrapper = screen.getByTestId('side-panel-wrapper');
      const incompleteIconClass = '.bp3-icon-box';
      const incompleteIconElement = sidePanelWrapper.querySelector(incompleteIconClass);
      expect(incompleteIconElement).toBeInTheDocument();

      const dueTag = screen.queryByTestId('due-tag');
      expect(dueTag).not.toBeInTheDocument();

      const newTag = screen.queryByTestId('new-tag');
      expect(newTag).toBeInTheDocument();
      expect(newTag).toHaveTextContent('5');
    });

    it('renders correct count when, limit set, one deck complete, but other deck has due and new cards', async () => {
      const mockBuilder = new testUtils.MockDataBuilder();

      mockBuilder.withSetting({
        dailyLimit: 5,
      });

      // Add completed deck
      mockBuilder.withCard({ uid: 'memo_1' });

      // Add deck with some new cards
      mockBuilder.withTag('deck-two');
      for (let i = 0; i < 10; i++) {
        mockBuilder.withCard({ uid: `deck_two_${i}`, tag: 'deck-two' });
      }

      // Create some cards due today
      for (let i = 0; i < 5; i++) {
        mockBuilder
          .withCard({ uid: `deck_two_due_${i}`, tag: 'deck-two' })
          .withSession(`deck_two_due_${i}`, {
            dateCreated: dateUtils.subtractDays(new Date(), 1),
            nextDueDate: new Date(),
          });
      }

      mockBuilder.mockQueryResults();

      await act(async () => {
        render(<App />);
      });

      const sidePanelWrapper = screen.getByTestId('side-panel-wrapper');
      const incompleteIconClass = '.bp3-icon-box';
      const incompleteIconElement = sidePanelWrapper.querySelector(incompleteIconClass);
      expect(incompleteIconElement).toBeInTheDocument();

      const dueTag = screen.queryByTestId('due-tag');
      expect(dueTag).toBeInTheDocument();
      expect(dueTag).toHaveTextContent('4');

      const newTag = screen.queryByTestId('new-tag');
      expect(newTag).toBeInTheDocument();
      expect(newTag).toHaveTextContent('1');
    });

    it('renders correct count when, limit set, has completed today cards', async () => {
      const mockBuilder = new testUtils.MockDataBuilder();

      mockBuilder.withSetting({
        dailyLimit: 5,
      });

      // Add completed deck
      mockBuilder.withCard({ uid: 'memo_1' });

      // Add deck with some new cards
      mockBuilder.withTag('deck-two');
      for (let i = 0; i < 10; i++) {
        mockBuilder.withCard({ uid: `deck_two_${i}`, tag: 'deck-two' });
      }

      // Create some cards due today
      for (let i = 0; i < 5; i++) {
        mockBuilder
          .withCard({ uid: `deck_two_due_${i}`, tag: 'deck-two' })
          .withSession(`deck_two_due_${i}`, {
            dateCreated: dateUtils.subtractDays(new Date(), 1),
            nextDueDate: new Date(),
          });
      }

      // Complete one new card (this is the one that was originaly selected)
      mockBuilder.withSession(`memo_1`, {
        dateCreated: new Date(),
        nextDueDate: dateUtils.addDays(new Date(), 1),
      });

      mockBuilder.mockQueryResults();

      await act(async () => {
        render(<App />);
      });

      const sidePanelWrapper = screen.getByTestId('side-panel-wrapper');
      const incompleteIconClass = '.bp3-icon-box';
      const incompleteIconElement = sidePanelWrapper.querySelector(incompleteIconClass);
      expect(incompleteIconElement).toBeInTheDocument();

      const dueTag = screen.queryByTestId('due-tag');
      expect(dueTag).toBeInTheDocument();
      expect(dueTag).toHaveTextContent('3');

      const newTag = screen.queryByTestId('new-tag');
      expect(newTag).toBeInTheDocument();
      expect(newTag).toHaveTextContent('1');
    });

    it('renders correct count when limit is 1, prioritizig due cards', async () => {
      const mockBuilder = new testUtils.MockDataBuilder();

      mockBuilder.withSetting({
        dailyLimit: 1,
      });

      // Add deck with some new cards
      mockBuilder.withTag('deck-two');
      for (let i = 0; i < 10; i++) {
        mockBuilder.withCard({ uid: `deck_two_${i}`, tag: 'deck-two' });
      }

      // Create some cards due today
      for (let i = 0; i < 5; i++) {
        mockBuilder
          .withCard({ uid: `deck_two_due_${i}`, tag: 'deck-two' })
          .withSession(`deck_two_due_${i}`, {
            dateCreated: dateUtils.subtractDays(new Date(), 1),
            nextDueDate: new Date(),
          });
      }

      mockBuilder.mockQueryResults();

      await act(async () => {
        render(<App />);
      });

      const sidePanelWrapper = screen.getByTestId('side-panel-wrapper');
      const incompleteIconClass = '.bp3-icon-box';
      const incompleteIconElement = sidePanelWrapper.querySelector(incompleteIconClass);
      expect(incompleteIconElement).toBeInTheDocument();

      const dueTag = screen.queryByTestId('due-tag');
      expect(dueTag).toBeInTheDocument();
      expect(dueTag).toHaveTextContent('1');

      const newTag = screen.queryByTestId('new-tag');
      expect(newTag).not.toBeInTheDocument();
    });

    it('renders correct count when limit is < 4, at least 1 new', async () => {
      const mockBuilder = new testUtils.MockDataBuilder();

      mockBuilder.withSetting({
        dailyLimit: 2,
      });

      // Add completed deck
      mockBuilder.withCard({ uid: 'memo_1' });

      // Add deck with some new cards
      mockBuilder.withTag('deck-two');
      for (let i = 0; i < 10; i++) {
        mockBuilder.withCard({ uid: `deck_two_${i}`, tag: 'deck-two' });
      }

      // Create some cards due today
      for (let i = 0; i < 5; i++) {
        mockBuilder
          .withCard({ uid: `deck_two_due_${i}`, tag: 'deck-two' })
          .withSession(`deck_two_due_${i}`, {
            dateCreated: dateUtils.subtractDays(new Date(), 1),
            nextDueDate: new Date(),
          });
      }

      mockBuilder.mockQueryResults();

      await act(async () => {
        render(<App />);
      });

      const sidePanelWrapper = screen.getByTestId('side-panel-wrapper');
      const incompleteIconClass = '.bp3-icon-box';
      const incompleteIconElement = sidePanelWrapper.querySelector(incompleteIconClass);
      expect(incompleteIconElement).toBeInTheDocument();

      const dueTag = screen.queryByTestId('due-tag');
      expect(dueTag).toBeInTheDocument();
      expect(dueTag).toHaveTextContent('1');

      const newTag = screen.queryByTestId('new-tag');
      expect(newTag).toBeInTheDocument();
      expect(newTag).toHaveTextContent('1');
    });

    it('renders correct count when target new count is less than available new card count', async () => {
      const mockBuilder = new testUtils.MockDataBuilder();

      mockBuilder.withSetting({
        dailyLimit: 20,
      });

      // Add deck with some new cards
      for (let i = 0; i < 4; i++) {
        mockBuilder.withCard({ uid: `id_new_${i}` });
      }

      // Create some cards due today
      for (let i = 0; i < 20; i++) {
        mockBuilder.withCard({ uid: `id_due_${i}` }).withSession(`id_due_${i}`, {
          dateCreated: dateUtils.subtractDays(new Date(), 1),
          nextDueDate: new Date(),
        });
      }

      mockBuilder.mockQueryResults();

      await act(async () => {
        render(<App />);
      });

      const sidePanelWrapper = screen.getByTestId('side-panel-wrapper');
      const incompleteIconClass = '.bp3-icon-box';
      const incompleteIconElement = sidePanelWrapper.querySelector(incompleteIconClass);
      expect(incompleteIconElement).toBeInTheDocument();

      const dueTag = screen.queryByTestId('due-tag');
      expect(dueTag).toBeInTheDocument();
      expect(dueTag).toHaveTextContent('16');

      const newTag = screen.queryByTestId('new-tag');
      expect(newTag).toBeInTheDocument();
      expect(newTag).toHaveTextContent('4');
    });

    it("renders correct count when target due can't can't be meet in first deck, but is available in second deck", async () => {
      const mockBuilder = new testUtils.MockDataBuilder();

      mockBuilder.withSetting({
        dailyLimit: 1,
      });

      // Add a due card to default deck (this is the one we want to skip)
      mockBuilder.withCard({ uid: 'memo_1' }).withSession('memo_1', {
        dateCreated: dateUtils.subtractDays(new Date(), 1),
        nextDueDate: new Date(),
      });

      // Add a due card to new deck
      const newDeckDueCard = 'deck-two-due-1';
      mockBuilder
        .withTag('deck-two')
        .withCard({ uid: newDeckDueCard, tag: 'deck-two' })
        .withSession(newDeckDueCard, {
          dateCreated: dateUtils.subtractDays(new Date(), 1),
          nextDueDate: new Date(),
        });

      mockBuilder.mockQueryResults();

      await act(async () => {
        render(<App />);
      });

      const sidePanelWrapper = screen.getByTestId('side-panel-wrapper');
      const incompleteIconClass = '.bp3-icon-box';
      const incompleteIconElement = sidePanelWrapper.querySelector(incompleteIconClass);
      expect(incompleteIconElement).toBeInTheDocument();

      const dueTag = screen.queryByTestId('due-tag');
      expect(dueTag).toBeInTheDocument();
      expect(dueTag).toHaveTextContent('1');

      const newTag = screen.queryByTestId('new-tag');
      expect(newTag).not.toBeInTheDocument();
    });

    it('takes completed cards in decks into account, keeping frozen distribution and subtracting completed cards', async () => {
      /**
       * With the frozen today snapshot, the initial allocation is fixed.
       * Completed cards are subtracted from the frozen UIDs, so the queue
       * shrinks as cards are completed. No redistribution occurs on refresh.
       *
       * NOTE: addNewCards reverses new card order when shuffleCards=false,
       * so the first new card selected is the last one added (1_new_4).
       *
       * Initial allocation (dailyLimit=3, 2 decks with weight 50 each):
       *   memo:     1 due card (1_due_0), 1 new card (1_new_4)
       *   deck-two: 1 due card (2_due_0), 0 new cards
       *
       * After completing 1_due_0 and 1_new_4 in memo:
       *   memo:     0 due (1_due_0 completed), 0 new (1_new_4 completed)
       *   deck-two: 1 due (2_due_0 still uncompleted), 0 new
       */
      const mockBuilder = new testUtils.MockDataBuilder();

      mockBuilder.withSetting({
        dailyLimit: 3,
        shuffleCards: false,
      });

      for (let i = 0; i < 5; i++) {
        mockBuilder.withCard({ uid: `1_due_${i}` }).withSession(`1_due_${i}`, {
          dateCreated: dateUtils.subtractDays(new Date(), 1),
          nextDueDate: new Date(),
        });
        mockBuilder.withCard({ uid: `1_new_${i}` });
      }

      mockBuilder.withTag('deck-two');
      for (let i = 0; i < 5; i++) {
        mockBuilder.withCard({ uid: `2_due_${i}`, tag: 'deck-two' }).withSession(`2_due_${i}`, {
          dateCreated: dateUtils.subtractDays(new Date(), 1),
          nextDueDate: new Date(),
        });
        mockBuilder.withCard({ uid: `2_new_${i}`, tag: 'deck-two' });
      }

      mockBuilder.mockQueryResults();

      await act(async () => {
        render(<App />);
      });

      mockBuilder.withSession(`1_due_0`, {
        dateCreated: new Date(),
        nextDueDate: dateUtils.addDays(new Date(), 1),
      });
      mockBuilder.withSession(`1_new_4`, {
        dateCreated: new Date(),
        nextDueDate: dateUtils.addDays(new Date(), 1),
      });
      mockBuilder.mockQueryResults();

      await act(async () => {
        testUtils.actions.launchModal();
      });

      await act(async () => {
        testUtils.actions.openTagSelector();
      });

      await waitFor(() => {
        const tagListElements = screen.getAllByTestId('tag-selector-item');

        const defaultDeckItem = tagListElements[0];
        const secondDeckItem = tagListElements[1];

        expect(defaultDeckItem.textContent).toContain('memo');
        expect(secondDeckItem.textContent).toContain('deck-two');

        const defaultDeckDue = within(defaultDeckItem).queryByTestId('tag-selector-due');
        const defaultDeckNew = within(defaultDeckItem).queryByTestId('tag-selector-new');
        const secondDeckDue = within(secondDeckItem).queryByTestId('tag-selector-due');
        const secondDeckNew = within(secondDeckItem).queryByTestId('tag-selector-new');

        expect(defaultDeckDue).not.toBeInTheDocument();
        expect(defaultDeckNew).not.toBeInTheDocument();
        expect(secondDeckDue).toHaveTextContent('1');
        expect(secondDeckNew).not.toBeInTheDocument();
      });
    });
  });
});
