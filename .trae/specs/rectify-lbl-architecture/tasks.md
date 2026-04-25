# Tasks

- [x] Task 1: 修正 `useLineByLineReview` 中 revealedCount 语义和导航行为
  - [x] SubTask 1.1: 修改初始定位 useEffect：统一 `setLineByLineRevealedCount(firstDueIndex + 1)`，删除 LblNext/SM2 区分
  - [x] SubTask 1.2: 修改 `onLineByLinePrev`：将 `Math.max(prev, newIndex + 1)` 改为 `newIndex + 1`（隐藏下方所有行）
  - [x] SubTask 1.3: 修改 `onLineByLineGrade` 中评分后的 revealedCount：所有 `setLineByLineRevealedCount(nextDueIndex)` 改为 `setLineByLineRevealedCount(nextDueIndex + 1)`
  - [x] SubTask 1.4: 修改 `onLineByLineShowAnswer`：检测下一行是否为隐藏的 SM2 行，若是则推进到该行并揭示；否则显示当前行答案
  - [x] SubTask 1.5: 新增 `onLineByLineSwitchToGradingAlgorithm` 回调：LBL 模式下切换到 SM2 时，如果 currentChildIndex > 0 则回退一行并隐藏 SM2 行；如果 currentChildIndex === 0 则仅隐藏答案。将此回调加入 hook 输出接口

- [x] Task 2: 修改 `PracticeOverlay` — SM2 切换处理 + setShowAnswers 逻辑
  - [x] SubTask 2.1: 在 `onSelectAlgorithm` 中，当 LBL 模式下切换到 grading 算法（SM2）时，调用 `onLineByLineSwitchToGradingAlgorithm()` 替代直接更新 childSessionData 后的默认行为
  - [x] SubTask 2.2: 修改 `setShowAnswers` useEffect 的 LBL 分支：当当前行是非 grading 算法且下一行是隐藏的 grading 算法时，设置 `showAnswers = false`（SM2 切换后的 Show Answer 状态）
  - [x] SubTask 2.3: 将 `onLineByLineSwitchToGradingAlgorithm` 传入 `MainContext`

- [x] Task 3: 修改 `Footer` — InteractionSelector 显示父级属性
  - [x] SubTask 3.1: 在 `GradingControlsWrapper` 中，LBL 模式下 `InteractionSelector` 显示父级卡片的 interaction 属性（而非子 block 的），切换时作用于父级卡片
  - [x] SubTask 3.2: 确保 `AlgorithmSelector` 在 LBL 模式下仍显示当前子 block 的算法

- [x] Task 4: 更新文档和注释
  - [x] SubTask 4.1: 在 `useLineByLineReview.ts` 注释中补充 SM2 交互逻辑说明和交互模式作用范围说明
  - [x] SubTask 4.2: 在 `PracticeOverlay.tsx` 注释中补充交互模式仅对一级队列产生影响的说明
  - [x] SubTask 4.3: 在 `Footer.tsx` 注释中补充 InteractionSelector 在 LBL 模式下显示父级属性的说明
  - [x] SubTask 4.4: 在 README 中补充交互模式作用范围的设计原则和 SM2 在 LBL 下的交互逻辑说明

- [x] Task 5: 验证 — 运行 lint 和 typecheck 确保代码正确
  - [x] SubTask 5.1: 运行 `npm run lint` 确保无 lint 错误
  - [x] SubTask 5.2: 运行 `npm run typecheck` 确保无类型错误

# Task Dependencies

- [Task 2] depends on [Task 1]（PracticeOverlay 需要 useLineByLineReview 的新接口）
- [Task 3] 可与 [Task 2] 并行执行
- [Task 4] depends on [Task 1], [Task 2], [Task 3]
- [Task 5] depends on [Task 1], [Task 2], [Task 3], [Task 4]
