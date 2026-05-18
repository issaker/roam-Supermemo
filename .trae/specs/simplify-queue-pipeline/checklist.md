# 简化队列数据流 — 验证清单

## Phase 1: 新类型定义 + 单遍分类函数

- [x] `TagCardSet` 和 `TagCardSets` 类型定义在 `models/practice.ts` 中
- [x] `classifyAllCards` 函数在 `queries/today.ts` 中实现
- [x] `classifyAllCards` 对每张卡片只调用一次 `classifyCard`（单遍分类）
- [x] `classifyAllCards` 产出的 dueUids 按 `sortNormalDueCardUids` 排序
- [x] `classifyAllCards` 产出的 newUids 支持 shuffle/reverse
- [x] `classifyAllCards` 正确处理 LBL 卡片（从子卡片分类）
- [ ] `classifyAllCards` 测试通过：Normal due/new/completed、LBL due/new/completed、混合 tag

## Phase 2: Pipeline 重写

- [x] `getPracticeData` 返回 `{ practiceData, tagCardSets }` 而非 `{ practiceData, todayStats }`
- [x] `getPracticeData` 内部只调用 2 步：`classifyAllCards` + `allocateDailyCards`
- [x] `allocateDailyCards` 直接操作 `TagCardSets`（裁剪 dueUids/newUids 数组）
- [x] `allocateDailyCards` 不再操作冗余计数字段
- [x] `allocateDailyCards` 测试通过适配新签名

## Phase 3: 消费方迁移

- [x] `usePracticeData` 状态类型从 `Today` 改为 `TagCardSets`
- [x] `PracticeSessionContext` 接口中 `today: Today` 改为 `tagCardSets: TagCardSets`
- [x] `useReviewRuntime` 输入参数从 `today: Today` 改为 `tagCardSets: TagCardSets`
- [x] `useReviewRuntime` 中 `cardSet` 直接从 `tagCardSets[selectedTag]` 获取
- [x] `useReviewRuntime` 不再调用 `deriveDeckSnapshot`
- [x] `useReviewRuntime` 返回 `renderMode` 从 `tagCardSets[selectedTag].renderMode` 获取
- [x] `useReviewRuntime` 返回已完成计数从 `effectiveQueue.completedUids.size` 获取
- [x] `deriveDeckSnapshot` 函数已删除
- [x] `DeckSnapshot` 类型已删除
- [x] `deriveChildSessionMap` 保留（仍被 PracticeOverlay 使用）
- [x] `PracticeOverlay` 不再使用 `deckSnapshot`
- [x] `PracticeOverlay` 的 `renderMode` 从 `tagCardSets` 获取
- [x] `PracticeOverlay` Done 状态已完成计数从 `effectiveQueue.completedUids.size` 获取
- [x] `Header.tsx` 的 `TagSelectorItem` 从 `tagCardSets[text]?.dueUids.length` 获取计数
- [x] `SidePanelWidget` 从 `tagCardSets` 按需推导 combined 统计

## Phase 4: 清理旧代码

- [x] `Today` 类型已删除
- [x] `TodayInitial` 已删除
- [x] `CompletionStatus` 保留（SidePanelWidget 仍在使用）
- [x] `initializeToday` 已删除
- [x] `calculateCompletedTodayCounts` 已删除
- [x] `addNewCards` 已删除
- [x] `addDueCards` 已删除
- [x] `calculateCombinedCounts` 已删除
- [x] `calculateTodayStatus` 已删除
- [x] `getDueCardUids` 已删除
- [x] 旧测试已删除或更新
- [x] README.md 架构说明已更新

## 跨 Phase 验证

- [x] typecheck 通过
- [x] 测试通过（date.test.ts 环境问题除外）
- [x] 无新增 `any` 类型（`cachedData: Record<string, any>` 为 Roam API 原有类型）
- [x] 无防御性代码
- [x] 新增公共函数有一行用途注释
- [ ] 手动测试：打开 review overlay，评分卡片，关闭重开——队列位置保持
- [ ] 手动测试：Forgot reinsert 正常工作
- [ ] 手动测试：LBL 评分——子卡片自动定位到下一个 due
- [ ] 手动测试：切换 tag——队列重建，currentIndex 重置到第一个未完成
- [ ] 手动测试：SidePanelWidget 显示正确的 due/new 计数
- [ ] 手动测试：Header TagSelector 显示正确的 per-tag 计数
- [ ] 手动测试：dailyLimit 设置——卡片数按权重比例分配
