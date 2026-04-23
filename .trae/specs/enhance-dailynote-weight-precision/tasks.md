# Tasks

## Phase 1: 数据模型与清理（无 UI 依赖）

- [x] Task 1: 移除 tagsListString 迁移代码
  - [x] 1.1: 在 `src/queries/settings.ts` 中删除迁移代码块及其内容
  - [x] 1.2: 移除 `DeckConfig` import 中仅为迁移逻辑添加的引用

- [x] Task 2: 更新默认 deckConfigs
  - [x] 2.1: 在 `src/hooks/useSettings.ts` 中检查 `dailynoteEnabled` 的默认值
  - [x] 2.2: 更新 `defaultSettings.deckConfigs` 为含 DailyNote 的默认值
  - [x] 2.3: 若 `dailynoteEnabled` 默认为 false，保持不变

## Phase 2: useTags 与数据流重构

- [x] Task 3: 移除 useTags 中 DailyNote 追加逻辑
  - [x] 3.1: 移除 DailyNote 追加逻辑
  - [x] 3.2: 移除 `dailynoteEnabled` 参数
  - [x] 3.3: tagsList 完全从 deckConfigs 解析
  - [x] 3.4: 移除 `DAILYNOTE_DECK_KEY` import

- [x] Task 4: 更新 app.tsx 传递给 useTags 的参数
  - [x] 4.1: 移除 `useTags` 调用中的 `dailynoteEnabled` 参数
  - [x] 4.2: 确认 `deckConfigs` 仍正确传递

## Phase 3: 限额分配算法修复

- [x] Task 5: 移除 limitRemainingPracticeData 中 DailyNote 特殊分支
  - [x] 5.1: 移除 `if (tag === DAILYNOTE_DECK_KEY) continue;`
  - [x] 5.2: DailyNote 自然参与 deckCaps 计算
  - [x] 5.3: 确认 `DAILYNOTE_DECK_KEY` 仍被 getSessionData 使用

- [x] Task 6: 修复权重为 0 的牌组在重分配阶段获得卡片的问题
  - [x] 6.1: 在重分配阶段添加权重为 0 的检查
  - [x] 6.2: 使用 `weightMap[tag] === 0` 而非 `deckCaps[tag] === 0` 区分舍入误差和真正的 0 权重
  - [x] 6.3: 验证：权重为 0 的牌组在初始分配和重分配阶段均不获得任何卡片

- [x] Task 7: 更新 initializeToday 移除 DailyNote 回退逻辑
  - [x] 7.1: DailyNote 现在在 deckConfigs 中有对应条目
  - [x] 7.2: matchedConfig 查找能匹配 DailyNote
  - [x] 7.3: 回退逻辑仍作为安全网保留

## Phase 4: UI 增强

- [x] Task 8: 增强 DeckConfigsTable 支持 DailyNote 特殊行
  - [x] 8.1: 新增 `dailynoteEnabled: boolean` prop
  - [x] 8.2: dailynoteEnabled=true 时自动添加 DailyNote
  - [x] 8.3: dailynoteEnabled=false 时自动移除 DailyNote
  - [x] 8.4: DailyNote 行名称显示为 "📅 DailyNote"（不可编辑）
  - [x] 8.5: DailyNote 行不可删除
  - [x] 8.6: DailyNote 行可上下移动
  - [x] 8.7: DailyNote 行可编辑 Swap Q/A 和 Weight %
  - [x] 8.8: 使用 `DAILYNOTE_DECK_KEY` 常量标识 DailyNote 行

- [x] Task 9: 增强 SettingsForm 说明文字与联动逻辑
  - [x] 9.1: 更新 Daily Review Limit 说明文字
  - [x] 9.2: 更新 Tag Pages (Decks) 说明文字
  - [x] 9.3: 实现 dailynoteEnabled 与 deckConfigs 联动
  - [x] 9.4: 将 `dailynoteEnabled` 传递给 `DeckConfigsTable`
  - [x] 9.5: 联动逻辑：启用/禁用时均分权重

## Phase 5: 测试与验证

- [x] Task 10: 运行测试与类型检查
  - [x] 10.1: 运行 `npx jest --no-coverage` — 117/119 通过（2 个预存失败）
  - [x] 10.2: 运行 `npm run typecheck` — 无错误
  - [x] 10.3: 修复了 weight=0 检查使用 deckCaps 而非 weightMap 导致的测试失败

- [x] Task 11: 验证权重分配精度
  - [x] 11.1: 2 牌组各 50%，dailyLimit=5 → 3+2=5 ✓
  - [x] 11.2: 1 牌组权重 0%，1 牌组 100% → 权重 0 牌组获得 0 张 ✓
  - [x] 11.3: 3 牌组，1 个权重 0% → 权重 0 牌组在重分配阶段也不获得卡片 ✓
  - [x] 11.4: DailyNote 30%，memo 70%，dailyLimit=10 → DailyNote 3 张，memo 7 张 ✓

# Task Dependencies

- Task 1 (移除迁移代码) — 无依赖
- Task 2 (更新默认值) — 无依赖
- Task 3 (useTags 重构) — 依赖 Task 2
- Task 4 (app.tsx 更新) — 依赖 Task 3
- Task 5 (移除 DailyNote 特殊分支) — 无依赖
- Task 6 (修复 weight=0) — 无依赖
- Task 7 (initializeToday) — 依赖 Task 5
- Task 8 (DeckConfigsTable 增强) — 依赖 Task 5 和 Task 6
- Task 9 (SettingsForm 增强) — 依赖 Task 8
- Task 10 (测试) — 依赖所有前置 Task
- Task 11 (精度验证) — 依赖 Task 10
