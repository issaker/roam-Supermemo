# Checklist

## 加载和持久化 Bug 修复

- [ ] DeckConfigsTable `useState` 使用函数初始化器直接解析 deckConfigs prop（不再初始化为空数组）
- [ ] DeckConfigsTable 中 `dailynoteEnabled` useEffect 已移除
- [ ] DeckConfigsTable 中 `deckConfigs` prop 的 useEffect 仍保留（用于外部 prop 变更时同步）
- [ ] `dailynoteEnabled` prop 仍用于 DailyNote 行的删除禁用判断
- [ ] 表格挂载时立即显示所有已有牌组（无闪烁）
- [ ] 用户编辑表格后点击 Apply & Restart，数据正确持久化

## Weight % 输入框宽度

- [ ] WeightInput styled component 宽度为 75px
- [ ] 数字不被遮挡

## 勾选框顺序

- [ ] 勾选框按以下顺序显示：Enable DailyNote Deck → Shuffle Cards → Auto Collapse Blocks After Review → Show Review Mode Borders → RTL Enabled

## 测试与类型检查

- [ ] `npx jest --no-coverage` 全部通过
- [ ] `npm run typecheck` 无错误
