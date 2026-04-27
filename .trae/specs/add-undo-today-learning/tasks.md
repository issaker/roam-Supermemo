# Tasks

- [x] Task 1: 实现 `undoTodaySession` 数据层函数
  - [x] SubTask 1.1: 在 `src/queries/data.ts` 中新增 `undoTodaySession(refUid, dataPageTitle)` 函数
  - [x] SubTask 1.2: 函数逻辑：查询卡片的所有 session block，删除同日（今天）的所有 block，保留非同日 block
  - [x] SubTask 1.3: 返回删除后的最新 session 数据（即前日 session），供 UI 层更新状态

- [x] Task 2: 简化 `savePracticeData` 同日处理逻辑
  - [x] SubTask 2.1: 移除 `todayBlock` 的覆盖更新逻辑（不再查找同日 block 并覆盖）
  - [x] SubTask 2.2: 移除 `shouldPreserveForgot` 判断和 `existingGrade` 解析
  - [x] SubTask 2.3: 同日已有 block 时始终创建新 session block（`createChildBlock`）
  - [x] SubTask 2.4: 保留字段完整性保护逻辑（从最新 session block 回填缺失字段）

- [x] Task 3: 新增 `CompletedTodayControls` 组件
  - [x] SubTask 3.1: 在 `src/components/overlay/Footer.tsx` 中创建 `CompletedTodayControls` 组件
  - [x] SubTask 3.2: 显示"撤销今日学习"按钮，包含算法名称标识
  - [x] SubTask 3.3: 按钮点击触发 `onUndoTodayLearning` 回调

- [x] Task 4: 修改 Footer 渲染逻辑
  - [x] SubTask 4.1: 在 Footer 的条件渲染中新增"今日已完成"分支（在 `!showAnswers` 之前）
  - [x] SubTask 4.2: 判断条件：`currentCardData` 存在 + `isSameDay(dateCreated, now)` + `sm2_grade !== 0`（非 Forgot 的今日完成状态）
  - [x] SubTask 4.3: LBL 子行的今日完成判断：子行 session 同日 + 非 Forgot

- [x] Task 5: 修改 PracticeOverlay 交互逻辑
  - [x] SubTask 5.1: 移除 `showOverwriteReminder` state 和 `OverwriteReminder` 组件
  - [x] SubTask 5.2: 移除 `isReScoring` 和 `isChildReScoring` 判断逻辑
  - [x] SubTask 5.3: 新增 `onUndoTodayLearning` 回调：调用 `undoTodaySession` + 清除 `sessionOverrides` + 刷新队列
  - [x] SubTask 5.4: 撤销后卡片重新出现在待复习队列中（重新计算 today 状态）

- [x] Task 6: 适配 LBL 模式
  - [x] SubTask 6.1: 在 `useLineByLineReview` 中移除 `isChildReScoring` 相关逻辑
  - [x] SubTask 6.2: LBL 子行今日完成时，Footer 显示"撤销今日学习"按钮
  - [x] SubTask 6.3: 撤销 LBL 子行时，调用 `undoTodaySession` 并更新 `childSessionData`

- [x] Task 7: 更新注释和 README
  - [x] SubTask 7.1: 更新 `save.ts` 中 `savePracticeData` 的注释，说明新的同日处理策略
  - [x] SubTask 7.2: 更新 README.md 中"Why update same-day session blocks"部分，说明撤销机制
  - [x] SubTask 7.3: 在 README Key Design Decisions 中新增"Why undo instead of overwrite"说明

# Task Dependencies

- Task 1 → Task 5 (undoTodaySession 函数是 onUndoTodayLearning 回调的基础)
- Task 2 → Task 5 (savePracticeData 简化后，撤销+重新学习的流程才能正确工作)
- Task 3 → Task 4 (CompletedTodayControls 组件是 Footer 渲染分支的基础)
- Task 4 + Task 5 → Task 6 (Normal 模式完成后适配 LBL 模式)
- Task 1 + Task 2 + Task 3 + Task 4 + Task 5 + Task 6 → Task 7 (所有功能完成后更新文档)
