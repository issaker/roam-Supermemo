# Tasks

- [x] Task 1: 修复 DeckConfigsTable 加载和持久化 Bug
  - [x] 1.1: 在 `src/components/DeckConfigsTable.tsx` 中，将 `useState<DeckConfig[]>([])` 改为使用函数初始化器直接解析 `deckConfigs` prop
  - [x] 1.2: 移除 `dailynoteEnabled` useEffect
  - [x] 1.3: 保留 `deckConfigs` prop 的 useEffect（用于外部 prop 变更时同步内部状态）
  - [x] 1.4: 保留 `dailynoteEnabled` prop 用于 DailyNote 行的删除禁用判断

- [x] Task 2: 增加 Weight % 输入框宽度
  - [x] 2.1: 将 `WeightInput` styled component 的 `width: 60px` 改为 `width: 75px`

- [x] Task 3: 调整 SettingsForm 勾选框顺序
  - [x] 3.1: 勾选框按新顺序排列：Enable DailyNote Deck → Shuffle Cards → Auto Collapse Blocks → Show Review Mode Borders → RTL Enabled

- [x] Task 4: 运行测试与类型检查
  - [x] 4.1: `npx jest --no-coverage` — 116/119 通过（3 个预存失败：2 date timezone + 1 PracticeOverlay mock）
  - [x] 4.2: `npm run typecheck` — 无错误
  - [x] 4.3: 无需修复（所有失败均为预存问题）

# Task Dependencies

- Task 1 (修复加载/持久化) — 无依赖
- Task 2 (输入框宽度) — 无依赖，可与 Task 1 并行
- Task 3 (勾选框顺序) — 无依赖，可与 Task 1 并行
- Task 4 (测试) — 依赖 Task 1-3
