# Tasks

- [x] Task 1: 修改 `isCompletedToday` 为 `isLearned`，统一基于 `nextDueDate` 判断
  - [x] SubTask 1.1: 在 PracticeOverlay.tsx 中将 `isCompletedToday` 重命名为 `isLearned`
  - [x] SubTask 1.2: 修改判断逻辑：Normal 模式使用 `isSessionMastered(currentCardData, now)`
  - [x] SubTask 1.3: LBL 模式使用 `isSessionMastered(childSession, now)` 判断当前子行
  - [x] SubTask 1.4: 将 `isLearned` 传递给 Footer（替换 `isCompletedToday` prop）

- [x] Task 2: 修改 `CompletedTodayControls` 按钮文案
  - [x] SubTask 2.1: 按钮文案从 "Undo Today (X)" 改为 "Undo Learning (X)"
  - [x] SubTask 2.2: Tooltip 从 "Reset today's learning record and re-learn this card" 改为 "Reset this card's learning record and re-learn"

- [x] Task 3: 修改 `calculateCompletedTodayCounts` 中 LBL 判断
  - [x] SubTask 3.1: 移除 LBL 特殊处理分支
  - [x] SubTask 3.2: 统一使用 `isSessionMastered(cardData, now)` 替代 `isSameDay(dateCreated, now)` 判断

- [x] Task 4: 修改 `onUndoTodayLearning` 回调名称和逻辑
  - [x] SubTask 4.1: 在 PracticeOverlay.tsx 中将 `onUndoTodayLearning` 重命名为 `onUndoLearning`
  - [x] SubTask 4.2: 在 Footer.tsx 中将 `onUndoTodayLearning` prop 重命名为 `onUndoLearning`
  - [x] SubTask 4.3: 更新 `undoTodaySession` 调用逻辑为 `undoLatestSession`

- [x] Task 5: 更新 `undoTodaySession` 支持非同日撤销
  - [x] SubTask 5.1: 修改 `undoTodaySession` 为 `undoLatestSession`：删除最新一条 session block（不限于同日）
  - [x] SubTask 5.2: 更新 data.ts 中的函数实现和导出

- [x] Task 6: 更新注释和 README
  - [x] SubTask 6.1: 更新 PracticeOverlay.tsx 中 `isLearned` 的注释
  - [x] SubTask 6.2: 更新 README.md 中相关设计决策说明

# Task Dependencies

- Task 1 → Task 2 (isLearned 重命名后 Footer 需要同步更新)
- Task 1 → Task 4 (isLearned 重命名后回调也需要同步重命名)
- Task 4 → Task 5 (回调重命名后需要更新底层函数)
- Task 1 + Task 2 + Task 3 + Task 4 + Task 5 → Task 6 (所有功能完成后更新文档)
