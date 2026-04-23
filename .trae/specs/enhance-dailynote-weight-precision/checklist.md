# Checklist

## 数据模型与清理

- [x] `src/queries/settings.ts` 中 `tagsListString` 迁移代码已完全移除
- [x] `defaultSettings.deckConfigs` 根据 `dailynoteEnabled` 默认值正确设置（含/不含 DailyNote）
- [x] `settings.ts` 中不再有任何 `tagsListString` 引用

## useTags 与数据流重构

- [x] `useTags` 不再接收 `dailynoteEnabled` 参数
- [x] `useTags` 不再追加 `DAILYNOTE_DECK_KEY` 到 tagsList
- [x] tagsList 完全从 deckConfigs 解析
- [x] `app.tsx` 正确传递参数给 `useTags`（无 `dailynoteEnabled`）

## 限额分配算法修复

- [x] `limitRemainingPracticeData` 中无 DailyNote 特殊分支（`if (tag === DAILYNOTE_DECK_KEY) continue` 已移除）
- [x] DailyNote 牌组按权重参与 deckCaps 计算
- [x] 权重为 0 的牌组在初始分配阶段不获得卡片（cap=0）
- [x] 权重为 0 的牌组在重分配阶段不获得卡片
- [x] `DAILYNOTE_DECK_KEY` 不再在 `data.ts` 中被引用（除非有其他用途）

## initializeToday 更新

- [x] DailyNote 在 deckConfigs 中有对应条目时，`initializeToday` 能正确读取其 swapQA 设置
- [x] 回退逻辑（cachedData）仍作为安全网保留

## UI 增强

- [x] `DeckConfigsTable` 接收 `dailynoteEnabled` prop
- [x] `dailynoteEnabled` 为 true 时，DailyNote 出现在表格中
- [x] `dailynoteEnabled` 为 false 时，DailyNote 不在表格中
- [x] DailyNote 行名称为纯文本 "DailyNote"，不可编辑
- [x] DailyNote 行不可删除（选中时删除按钮禁用）
- [x] DailyNote 行可上下移动
- [x] DailyNote 行可编辑 Swap Q/A
- [x] DailyNote 行可编辑 Weight %
- [x] DailyNote 行有视觉标识区分普通牌组
- [x] SettingsForm 中 Daily Review Limit 说明文字包含权重分配逻辑描述
- [x] SettingsForm 中 Tag Pages (Decks) 说明文字包含 Weight % 计算逻辑和 0 值含义
- [x] 切换 "Enable DailyNote Deck" 复选框时，deckConfigs 自动同步（添加/移除 DailyNote，均分权重）
- [x] `dailynoteEnabled` 正确传递给 `DeckConfigsTable`

## 测试与验证

- [x] `npx jest --no-coverage` 全部通过
- [x] `npm run typecheck` 无错误
- [x] 验证：2 牌组各 50%，dailyLimit=5 → 每牌组 2 张 + 重分配 1 张
- [x] 验证：1 牌组权重 0%，1 牌组 100% → 权重 0 牌组获得 0 张
- [x] 验证：3 牌组，1 个权重 0% → 权重 0 牌组在重分配阶段也不获得卡片
- [x] 验证：DailyNote 30%，memo 70%，dailyLimit=10 → DailyNote 3 张，memo 7 张
