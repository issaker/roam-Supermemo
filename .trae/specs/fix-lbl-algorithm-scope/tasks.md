# Tasks

- [x] Task 1: 修改 `useLineByLineReview` — 算法来源改为当前子 block + childSessionData 即时更新 + 移除 isLblNext 对 useEffect 的依赖
  - [x] SubTask 1.1: 新增 `currentChildAlgorithm` 计算逻辑：从 `childSessionData[childUid].algorithm` 获取，无数据时回退到父级 `algorithm`
  - [x] SubTask 1.2: 新增 `currentChildIsLblNext` 计算逻辑：基于 `currentChildAlgorithm` 判断 `!isGradingAlgorithm(currentChildAlgorithm)`
  - [x] SubTask 1.3: 修改 `onLineByLineGrade`：将 `isLblNext` 替换为 `currentChildIsLblNext`，将 `algorithm` 替换为 `currentChildAlgorithm`（在 isLblNext 和 SM2 两个分支中）
  - [x] SubTask 1.4: 修改 `onLineByLineGrade`：评分完成后调用 `setChildSessionData` 更新当前子 block 的 session 数据（由调用方 PracticeOverlay 传入 setter）
  - [x] SubTask 1.5: 从 useEffect 依赖数组中移除 `isLblNext`，避免算法切换触发索引重置
  - [x] SubTask 1.6: 在 hook 接口中新增 `setChildSessionData` 参数和 `currentChildAlgorithm`、`currentChildIsLblNext` 输出
- [x] Task 2: 修改 `PracticeOverlay` — onSelectAlgorithm LBL 分支 + effectiveBaseCardData + showAnswers 逻辑 + Footer props
  - [x] SubTask 2.1: 修改 `onSelectAlgorithm`：当 `isLineByLineActive` 时，将 `refUid` 改为当前子 block UID（`childUidsList[lineByLineCurrentChildIndex]`），更新 `childSessionData` 和 `sessionOverrides` 中子 block 的 algorithm，不修改父级 algorithm
  - [x] SubTask 2.2: 修改 `effectiveBaseCardData`：在 LBL 模式下使用当前子 block 的 algorithm（从 `childSessionData` 获取）
  - [x] SubTask 2.3: 修改 `setShowAnswers` useEffect：在 LBL 模式下使用当前子 block 的 algorithm 判断是否自动显示答案
  - [x] SubTask 2.4: 将 `setChildSessionData` 传入 `useLineByLineReview`
  - [x] SubTask 2.5: 将 `currentChildAlgorithm` 和 `currentChildIsLblNext` 从 `useLineByLineReview` 输出传入 `MainContext`，供 Footer 使用
- [x] Task 3: 修改 `Footer` — isLblNextActive 和 intervalEstimates 基于当前子 block 算法
  - [x] SubTask 3.1: 从 `MainContext` 获取 `currentChildAlgorithm` 和 `currentChildIsLblNext`
  - [x] SubTask 3.2: 修改 `GradingControlsWrapper` 中的 `isLblNextActive` 判定：LBL 模式下使用 `currentChildIsLblNext`
  - [x] SubTask 3.3: 修改 `intervalEstimates` 计算：LBL 模式下使用 `currentChildAlgorithm` 替代 `algorithmFromSession`
- [x] Task 4: 验证 — 运行 lint 和 typecheck 确保代码正确
  - [x] SubTask 4.1: 运行 `npm run lint` 确保无 lint 错误
  - [x] SubTask 4.2: 运行 `npm run typecheck` 确保无类型错误

# Task Dependencies

- [Task 2] depends on [Task 1]（PracticeOverlay 需要 useLineByLineReview 的新接口）
- [Task 3] depends on [Task 2]（Footer 需要 MainContext 中的新字段）
- [Task 4] depends on [Task 3]（验证需要在所有修改完成后进行）
