# 统一 LBL 卡片学习状态判断 Spec

## Why

当前 LBL 模式下，卡片学习状态判断存在两套标准：
1. **UI 层**（`isCompletedToday`）：基于 `isSameDay(dateCreated, now) && sm2_grade !== 0` 判断"今日已完成"
2. **统计层**（`calculateCompletedTodayCounts`）：基于 `isSameDay(dateCreated, now) && !isSessionDue` 判断"今日已完成"

这两套标准在 LBL 模式下产生语义分歧：一个子行今日已评分（UI 层视为已完成），但其 `nextDueDate` 可能仍 <= now（统计层视为未完成）。用户看到"Undo Today"按钮，但侧边栏计数却不增加，造成困惑。

此外，当前 `isCompletedToday` 的判断依赖 `dateCreated` 和 `sm2_grade`，而 `nextDueDate` 是更本质的"学习状态"指标——评分后 `nextDueDate > now` 意味着卡片已进入下一轮复习周期，这才是"已学习"的真正含义。

## What Changes

- 统一学习状态判断标准：所有卡片（Normal + LBL 子行）基于 `nextDueDate > now` 判断"已学习"
- 修改 `isCompletedToday` 为 `isLearned`：判断条件从 `isSameDay(dateCreated) && sm2_grade !== 0` 改为 `isSessionMastered(session, now)`（即 `nextDueDate > now`）
- 修改 `calculateCompletedTodayCounts` 中 LBL 卡片的特殊处理：与 `isLearned` 统一标准
- 修改 `onUndoTodayLearning` 回调名称为 `onUndoLearning`（语义更准确）
- 更新 `CompletedTodayControls` 按钮文案为 "Undo Learning"（不再限定"今日"）

## Impact

- Affected specs: 学习状态判断逻辑、撤销按钮交互、今日完成计数
- Affected code:
  - `src/components/overlay/PracticeOverlay.tsx` — `isCompletedToday` → `isLearned`
  - `src/components/overlay/Footer.tsx` — `CompletedTodayControls` 按钮文案更新
  - `src/queries/today.ts` — `calculateCompletedTodayCounts` 中 LBL 判断统一

---

## ADDED Requirements

### Requirement: 统一学习状态判断标准

系统 SHALL 使用 `nextDueDate > now`（即 `isSessionMastered`）作为所有卡片的学习状态判断标准，替代当前的 `isSameDay(dateCreated, now) && sm2_grade !== 0`。

#### Scenario: SM2 卡片评分后 nextDueDate > now

- **GIVEN** 一张 SM2 卡片今日评分 Good（grade=4）
- **WHEN** 评分后 `nextDueDate` 为明天（> now）
- **THEN** `isLearned = true`，底部显示 "Undo Learning" 按钮

#### Scenario: SM2 卡片 Forgot 后 nextDueDate <= now

- **GIVEN** 一张 SM2 卡片今日评分 Forgot（grade=0）
- **WHEN** 评分后 `nextDueDate` 为今天（<= now，需重学）
- **THEN** `isLearned = false`，底部显示评分按钮（Forgot 重插后可重新评分）

#### Scenario: Progressive 子行评分后 nextDueDate > now

- **GIVEN** LBL 模式下一个 Progressive 子行今日点击 Next
- **WHEN** 评分后 `nextDueDate` 为未来日期（> now）
- **THEN** `isLearned = true`，底部显示 "Undo Learning" 按钮

#### Scenario: LBL 子行未评分但用户导航查看

- **GIVEN** LBL 模式下一个子行的 `nextDueDate > now`（已掌握，非 due）
- **WHEN** 用户通过 ▲/▼ 导航到该子行
- **THEN** `isLearned = true`，底部显示 "Undo Learning" 按钮（该子行已学习，无需再评）

#### Scenario: LBL 子行 due 且未评分

- **GIVEN** LBL 模式下一个子行的 `nextDueDate <= now`（due，需复习）
- **WHEN** 用户导航到该子行
- **THEN** `isLearned = false`，底部显示评分按钮

---

## MODIFIED Requirements

### Requirement: isCompletedToday → isLearned

**原行为**：`isCompletedToday` 基于 `isSameDay(dateCreated, now) && sm2_grade !== 0` 判断。

**新行为**：`isLearned` 基于 `isSessionMastered(session, now)`（即 `nextDueDate > now`）判断。

#### Scenario: 昨日评分的卡片今日查看

- **GIVEN** 一张卡片昨日评分 Good，`nextDueDate` 为 6 天后
- **WHEN** 用户今日导航到该卡片
- **THEN** `isLearned = true`（`nextDueDate > now`），底部显示 "Undo Learning" 按钮
- **AND** 点击撤销后，删除昨日 session block，卡片回退到前日状态

**注意**：这扩展了撤销的适用范围——不再限于"今日已完成"，而是"已学习"（`nextDueDate > now`）的卡片都可以撤销。用户可能撤销昨日的学习记录，这需要明确提示。

### Requirement: CompletedTodayControls 按钮文案

**原行为**：按钮文案为 "Undo Today (SM2/Progressive/FixedTime)"。

**新行为**：按钮文案为 "Undo Learning (SM2/Progressive/FixedTime)"。Tooltip 提示更新为 "Reset this card's learning record and re-learn"。

### Requirement: calculateCompletedTodayCounts 中 LBL 判断

**原行为**：LBL 卡片使用 `isSameDay(dateCreated, now) && !isSessionDue` 判断。

**新行为**：统一使用 `isSessionMastered(session, now)` 判断，与 UI 层一致。移除 LBL 特殊处理分支。

---

## REMOVED Requirements

### Requirement: isCompletedToday 基于 dateCreated 的判断

**Reason**：`dateCreated` 是"最后一次操作时间"，不是"学习状态"的可靠指标。Forgot 后 `dateCreated` 是今天但卡片仍需重学，不应视为"已完成"。`nextDueDate` 才是学习状态的正确语义。

**Migration**：`isCompletedToday` 重命名为 `isLearned`，判断条件从 `isSameDay(dateCreated) && sm2_grade !== 0` 改为 `isSessionMastered(session, now)`。

### Requirement: calculateCompletedTodayCounts 中 LBL 特殊处理

**Reason**：统一标准后不再需要 LBL 特殊分支。`isSessionMastered` 对 Normal 和 LBL 子行语义一致。

**Migration**：移除 `if (cardData.interaction === 'LBL') { if (isSessionDue(cardData, now)) return; }` 分支，统一使用 `isSessionMastered` 判断。
