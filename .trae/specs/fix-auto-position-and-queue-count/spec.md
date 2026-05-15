# 修复自动定位与队列计数 Spec

## Why

切换牌组时 currentIndex 未自动定位到首张未练习卡片（停留在 index 0），且队列计数（Header "当前/总数"、侧栏计数）未能正确反映 Daily Review Limit 约束下的当日练习总量。两个问题有共同根因：reducer 内 effectiveQueue 计算与 selector 不一致，以及 tagCardSets 快照不随评分实时更新。

## What Changes

- **CHANGE_TAG 直接计算自动定位**：reducer 在处理 CHANGE_TAG 时直接调用 `findNextUnpracticedIndex`，不再设 `currentIndex=0` 等待异步 QUEUE_INIT 兜底
- **统一 effectiveQueue 计算**：将 reducer 中散落的 `queue.uids.filter(uid => !removedSet.has(uid))` 替换为 `selectEffectiveQueue` 的三层过滤逻辑（uids - removedUids - cardSet mask），消除索引与展示不一致
- **Tag 选择单一真相源**：`onTagChange` 同时更新 App 层 `selectedTag`，消除 Store 与 App 双源分裂
- **队列计数区分"待练习"与"已完成"**：新增 `selectRemainingCount` 选择器，Header 显示 "当前/待练习总数" 而非 "当前/队列总长"
- **allocateDailyCards 对 completedUids 做 cap 截断**：单牌组的 completedUids 不超过该牌组的 cap，使队列计数与配额一致
- **评分后实时更新 tagCardSets 分类**：GRADE_CARD action 中同步更新 tagCardSets 的 dueUids/newUids/completedUids，使计数和定位都基于最新状态

## Impact

- Affected specs: queue-system-refactor（已落地，本次在其基础上修 bug）、simplify-queue-pipeline（已落地）
- Affected code:
  - `src/review-runtime/store/reducer.ts` — CHANGE_TAG、QUEUE_INIT、GRADE_CARD handler 修改
  - `src/review-runtime/store/selectors.ts` — 新增 selectRemainingCount，修改 selectCompletedCount
  - `src/review-runtime/store/queue-logic.ts` — 抽取 computeEffectiveQueue 纯函数
  - `src/review-runtime/store/context.tsx` — 无需修改（useEffect 逻辑不变）
  - `src/components/overlay/PracticeOverlay.tsx` — onTagChange 同步更新 App 层
  - `src/components/overlay/Header.tsx` — 使用 selectRemainingCount 替代 selectCardQueueLength
  - `src/queries/dataProcessing.ts` — allocateDailyCards 对 completedUids 做 cap 截断

## ADDED Requirements

### Requirement: CHANGE_TAG 直接计算自动定位

系统 SHALL 在 CHANGE_TAG action 中直接调用 `findNextUnpracticedIndex` 计算 currentIndex，而非设为 0 等待异步 QUEUE_INIT。

#### Scenario: 切换到有已完成卡片的牌组
- **WHEN** 用户从牌组 A 切换到牌组 B，牌组 B 的前 3 张卡片已完成
- **THEN** currentIndex 直接设为 3（首张未练习卡片的索引），无需等待 QUEUE_INIT

#### Scenario: 切换到新牌组（cardSet 暂时为空）
- **WHEN** 用户切换到一个尚未加载 cardSet 的牌组
- **THEN** currentIndex 设为 0（findNextUnpracticedIndex 在空队列上返回 0），后续 QUEUE_INIT 仍会重新定位

### Requirement: 统一 effectiveQueue 计算

系统 SHALL 将 effectiveQueue 的三层过滤逻辑（uids - removedUids - cardSet mask）抽取为纯函数 `computeEffectiveQueue`，reducer 和 selector 共用同一函数。

#### Scenario: 评分后自动前进定位准确
- **WHEN** dailyLimit=5 导致队列快照有 8 张卡片但 cardSet 只有 5 张
- **AND** 用户评分第 3 张卡片
- **THEN** handleGradeCard 中的 findNextUnpracticedIndex 基于 effectiveQueue（5 张）计算索引，与 UI 展示一致

### Requirement: Tag 选择单一真相源

系统 SHALL 确保 `onTagChange` 同时更新 Store 和 App 层的 selectedTag，消除双源分裂。

#### Scenario: 切换牌组后关闭重开 Overlay
- **WHEN** 用户在 Overlay 中从牌组 A 切换到牌组 B
- **AND** 关闭 Overlay 后重新打开
- **THEN** 仍显示牌组 B，不会回退到牌组 A

### Requirement: 队列计数区分待练习与已完成

系统 SHALL 提供 `selectRemainingCount` 选择器，返回 effectiveQueue 中未完成今日练习的卡片数。Header 显示 "当前/待练习总数"。

#### Scenario: 有已完成卡片时显示正确计数
- **WHEN** 队列有 10 张卡片，其中 3 张已完成
- **THEN** Header 显示 "4/7"（当前第 4 张，待练习 7 张），而非 "4/10"

#### Scenario: 全部完成时显示正确计数
- **WHEN** 队列有 10 张卡片，全部已完成
- **THEN** Header 显示 "10/0" 或 done 状态

### Requirement: allocateDailyCards 对 completedUids 做 cap 截断

系统 SHALL 在 allocateDailyCards 中对每个牌组的 completedUids 做 cap 截断，确保单牌组总卡片数（completed + due + new）不超过该牌组的 cap。

#### Scenario: 牌组已完成卡片超过 cap
- **WHEN** 牌组 A 的 cap=5，但已有 8 张 completedUids
- **THEN** completedUids 被截断为 5（保留最近完成的 5 张），dueUids 和 newUids 为 0

#### Scenario: 牌组已完成卡片未超过 cap
- **WHEN** 牌组 A 的 cap=5，有 3 张 completedUids
- **THEN** completedUids 保留 3 张，剩余配额 2 分配给 dueUids/newUids

### Requirement: 评分后实时更新 tagCardSets 分类

系统 SHALL 在 GRADE_CARD action 中同步更新 tagCardSets 的 dueUids/newUids/completedUids，将已完成的卡片从 due/new 移到 completed。

#### Scenario: 评分后计数立即更新
- **WHEN** 用户评分一张 due 卡片为 Good
- **THEN** 该卡片的 uid 从 tagCardSets[selectedTag].dueUids 移到 completedUids
- **AND** selectRemainingCount 立即减少 1

#### Scenario: 评分后侧栏计数立即更新
- **WHEN** 用户评分一张 due 卡片
- **THEN** selectSidebarCounts 的 dueCount 立即减少 1

## MODIFIED Requirements

### Requirement: selectCompletedCount 基于 tagCardSets 实时分类

`selectCompletedCount` SHALL 直接从 tagCardSets.completedUids.length 获取已完成计数，不再遍历 dueUids/newUids 做 isCardCompletedToday 补偿（因为评分后已完成卡片已被移入 completedUids）。

### Requirement: selectSidebarCounts / selectTagCounts 基于 tagCardSets 实时分类

`selectSidebarCounts` 和 `selectTagCounts` SHALL 从 tagCardSets 的 dueUids/newUids/completedUids 直接计数，不再对每个 uid 重新 classifyCard（因为评分后分类已实时更新）。

## REMOVED Requirements

无删除。所有修改都是增量或替换现有实现。
