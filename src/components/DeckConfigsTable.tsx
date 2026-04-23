import * as React from 'react';
import * as Blueprint from '@blueprintjs/core';
import styled from '@emotion/styled';
import { DeckConfig } from '~/hooks/useSettings';
import { redistributeWeights, equalizeWeights, validateWeight } from '~/utils/deckWeight';
import { DAILYNOTE_DECK_KEY } from '~/constants';
import { colors } from '~/theme';

interface DeckConfigsTableProps {
  deckConfigs: string;
  onChange: (deckConfigs: string) => void;
  dailynoteEnabled: boolean;
}

const TableWrapper = styled.div`
  width: 100%;
  overflow-x: auto;
`;

const StyledTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  th, td {
    border: 1px solid ${colors.borderSubtle};
    padding: 4px 8px;
    text-align: left;
    vertical-align: middle;
  }

  th {
    font-weight: 600;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    opacity: 0.7;
  }
`;

const SelectedRow = styled.tr`
  background-color: rgba(137, 191, 255, 0.25);
`;

const DailyNoteRow = styled.tr`
  background-color: rgba(255, 235, 59, 0.1);
`;

const ActionBar = styled.div`
  display: flex;
  gap: 4px;
  margin-top: 6px;
`;

const NameInput = styled.input`
  width: 100%;
  min-width: 80px;
`;

const WeightInput = styled.input`
  width: 60px;
`;

const DeckConfigsTable: React.FC<DeckConfigsTableProps> = ({ deckConfigs, onChange, dailynoteEnabled }) => {
  const isDailyNote = (name: string) => name === DAILYNOTE_DECK_KEY;

  const [decks, setDecks] = React.useState<DeckConfig[]>([]);
  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null);
  const [editingNewName, setEditingNewName] = React.useState<number | null>(null);

  React.useEffect(() => {
    try {
      const parsed = JSON.parse(deckConfigs);
      if (Array.isArray(parsed)) {
        setDecks(parsed);
      }
    } catch {
      setDecks([]);
    }
  }, [deckConfigs]);

  React.useEffect(() => {
    if (dailynoteEnabled && !decks.some((d) => d.name === DAILYNOTE_DECK_KEY)) {
      const newDecks = [...decks, { name: DAILYNOTE_DECK_KEY, swapQA: false, weight: 0 }];
      const weights = equalizeWeights(newDecks.length);
      const updated = newDecks.map((d, i) => ({ ...d, weight: weights[i] }));
      emitChange(updated);
    } else if (!dailynoteEnabled && decks.some((d) => d.name === DAILYNOTE_DECK_KEY)) {
      const newDecks = decks.filter((d) => d.name !== DAILYNOTE_DECK_KEY);
      const weights = equalizeWeights(newDecks.length);
      const updated = newDecks.map((d, i) => ({ ...d, weight: weights[i] }));
      emitChange(updated);
    }
  }, [dailynoteEnabled]);

  const emitChange = (updated: DeckConfig[]) => {
    setDecks(updated);
    onChange(JSON.stringify(updated));
  };

  const handleAddRow = () => {
    const newDeck: DeckConfig = { name: '', swapQA: false, weight: 0 };
    const newDecks = [...decks, newDeck];
    const weights = equalizeWeights(newDecks.length);
    const updated = newDecks.map((d, i) => ({ ...d, weight: weights[i] }));
    const newIndex = newDecks.length - 1;
    setSelectedIndex(newIndex);
    setEditingNewName(newIndex);
    emitChange(updated);
  };

  const handleDeleteRow = () => {
    if (selectedIndex === null || decks.length <= 1) return;
    const newDecks = decks.filter((_, i) => i !== selectedIndex);
    const weights = equalizeWeights(newDecks.length);
    const updated = newDecks.map((d, i) => ({ ...d, weight: weights[i] }));
    setSelectedIndex(null);
    setEditingNewName(null);
    emitChange(updated);
  };

  const handleMoveUp = () => {
    if (selectedIndex === null || selectedIndex === 0) return;
    const updated = [...decks];
    [updated[selectedIndex - 1], updated[selectedIndex]] = [updated[selectedIndex], updated[selectedIndex - 1]];
    setSelectedIndex(selectedIndex - 1);
    emitChange(updated);
  };

  const handleMoveDown = () => {
    if (selectedIndex === null || selectedIndex === decks.length - 1) return;
    const updated = [...decks];
    [updated[selectedIndex], updated[selectedIndex + 1]] = [updated[selectedIndex + 1], updated[selectedIndex]];
    setSelectedIndex(selectedIndex + 1);
    emitChange(updated);
  };

  const handleWeightChange = (index: number, rawValue: string) => {
    const newWeight = validateWeight(Number(rawValue));
    const updated = redistributeWeights(decks, index, newWeight);
    emitChange(updated);
  };

  const handleSwapQAChange = (index: number, checked: boolean) => {
    const updated = decks.map((d, i) => (i === index ? { ...d, swapQA: checked } : d));
    emitChange(updated);
  };

  const handleNameCommit = (index: number, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const updated = decks.map((d, i) => (i === index ? { ...d, name: trimmed } : d));
    setEditingNewName(null);
    emitChange(updated);
  };

  const handleNameKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleNameCommit(index, (e.target as HTMLInputElement).value);
    }
  };

  const handleNameBlur = (index: number, value: string) => {
    handleNameCommit(index, value);
  };

  return (
    <TableWrapper>
      <StyledTable>
        <thead>
          <tr>
            <th style={{ width: '50%' }}>Deck Name</th>
            <th style={{ width: '20%', textAlign: 'center' }}>Swap Q/A</th>
            <th style={{ width: '30%', textAlign: 'center' }}>Weight %</th>
          </tr>
        </thead>
        <tbody>
          {decks.map((deck, index) => {
            const isSelected = selectedIndex === index;
            const isNewName = editingNewName === index;
            const isDN = isDailyNote(deck.name);
            const RowComponent = isSelected ? SelectedRow : (isDN ? DailyNoteRow : 'tr');

            return (
              <RowComponent
                key={index}
                onClick={() => setSelectedIndex(index)}
                style={{ cursor: 'pointer' }}
              >
                <td>
                  {isDN ? (
                    '📅 DailyNote'
                  ) : isNewName || deck.name === '' ? (
                    <NameInput
                      className="bp3-input"
                      type="text"
                      autoFocus
                      defaultValue={deck.name}
                      onKeyDown={(e) => handleNameKeyDown(index, e)}
                      onBlur={(e) => handleNameBlur(index, e.target.value)}
                    />
                  ) : (
                    deck.name
                  )}
                </td>
                <td style={{ textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    className="bp3-checkbox"
                    checked={deck.swapQA}
                    onChange={(e) => handleSwapQAChange(index, e.target.checked)}
                  />
                </td>
                <td style={{ textAlign: 'center' }}>
                  <WeightInput
                    className="bp3-input"
                    type="number"
                    min={0}
                    max={100}
                    value={deck.weight}
                    disabled={decks.length === 1}
                    onChange={(e) => handleWeightChange(index, e.target.value)}
                  />
                </td>
              </RowComponent>
            );
          })}
        </tbody>
      </StyledTable>
      <ActionBar>
        <Blueprint.Button icon="plus" small onClick={handleAddRow} />
        <Blueprint.Button
          icon="minus"
          small
          onClick={handleDeleteRow}
          disabled={decks.length <= 1 || selectedIndex === null || (selectedIndex !== null && isDailyNote(decks[selectedIndex].name))}
        />
        <Blueprint.Button
          icon="arrow-up"
          small
          onClick={handleMoveUp}
          disabled={selectedIndex === null || selectedIndex === 0}
        />
        <Blueprint.Button
          icon="arrow-down"
          small
          onClick={handleMoveDown}
          disabled={selectedIndex === null || selectedIndex === decks.length - 1}
        />
      </ActionBar>
    </TableWrapper>
  );
};

export default DeckConfigsTable;
