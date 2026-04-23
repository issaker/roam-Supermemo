# 修复 deckConfigs 加载/持久化 Bug 及 UI 调整 Spec

## Why

DeckConfigsTable 组件存在严重的加载和持久化 Bug：表格无法正确读取已存储的 deckConfigs 数据，且用户编辑后的表格数据在 Apply & Restart 后丢失。根因是 DeckConfigsTable 的 `dailynoteEnabled` useEffect 在组件挂载时使用了过时的空 `decks` 状态，将 deckConfigs 覆盖为仅含 DailyNote 的数组。同时 Weight % 输入框宽度过窄，以及设置页勾选框顺序需要调整。

## What Changes

- 修复 DeckConfigsTable 加载 Bug：移除 `dailynoteEnabled` useEffect（与 SettingsForm 中的联动逻辑重复且冲突），改为在 `useState` 初始化时直接解析 deckConfigs prop
- 修复 DeckConfigsTable 持久化 Bug：根因同上，`dailynoteEnabled` useEffect 覆盖了用户编辑的数据
- 增加 Weight % 输入框宽度（从 60px 增加到 75px）
- 调整 SettingsForm 中勾选框选项的显示顺序

## Impact

- Affected code:
  - `src/components/DeckConfigsTable.tsx` — 移除 `dailynoteEnabled` useEffect，修复 `useState` 初始化，增加 Weight % 输入框宽度
  - `src/components/SettingsForm.tsx` — 调整勾选框顺序

## ADDED Requirements

### Requirement: DeckConfigsTable 正确加载 deckConfigs 数据

系统 SHALL 在 DeckConfigsTable 组件挂载时正确读取并显示 deckConfigs 中的所有牌组。

#### Scenario: 组件挂载时显示已有牌组
- **GIVEN** deckConfigs 中存储了 `[{"name":"memo","swapQA":false,"weight":50},{"name":"DailyNote","swapQA":false,"weight":50}]`
- **WHEN** DeckConfigsTable 组件挂载
- **THEN** 表格立即显示 memo 和 DailyNote 两个牌组
- **AND** 不出现先空后有的闪烁

#### Scenario: 浏览器重新加载插件后表格正确显示
- **GIVEN** 用户之前通过 Apply & Restart 保存了 deckConfigs
- **WHEN** 浏览器重新加载插件，打开 Memo Settings
- **THEN** Tag Pages (Decks) 表格正确显示所有已保存的牌组

### Requirement: DeckConfigsTable 编辑结果正确持久化

系统 SHALL 确保用户在表格中编辑的牌组数据在 Apply & Restart 后仍然保留。

#### Scenario: 添加牌组后持久化
- **GIVEN** 用户在表格中添加了一个新牌组
- **WHEN** 用户点击 Apply & Restart
- **THEN** 重新打开 Memo Settings 后，新添加的牌组仍然在表格中

#### Scenario: 修改权重后持久化
- **GIVEN** 用户修改了某牌组的 Weight %
- **WHEN** 用户点击 Apply & Restart
- **THEN** 重新打开 Memo Settings 后，修改后的权重值仍然在表格中

### Requirement: Weight % 输入框宽度适配

系统 SHALL 提供 Weight % 输入框足够的宽度以完整显示数字。

#### Scenario: 输入框宽度
- **WHEN** 查看 Weight % 输入框
- **THEN** 输入框宽度为 75px（原 60px 增加约 1/4）
- **AND** 数字不被遮挡

### Requirement: 勾选框选项顺序

系统 SHALL 按以下顺序显示 Memo Settings 中的勾选框选项：

#### Scenario: 勾选框显示顺序
- **WHEN** 查看 Memo Settings 中的勾选框选项
- **THEN** 按以下顺序显示：
  1. Enable DailyNote Deck
  2. Shuffle Cards
  3. Auto Collapse Blocks After Review
  4. Show Review Mode Borders
  5. Right-to-Left (RTL) Enabled

## MODIFIED Requirements

### Requirement: DeckConfigsTable 初始化逻辑

原 DeckConfigsTable 使用 `useState<DeckConfig[]>([])` 初始化为空数组，然后通过两个 useEffect 分别解析 deckConfigs prop 和处理 dailynoteEnabled 同步。修改为：

- `useState` 初始化时直接解析 deckConfigs prop（不再初始化为空数组）
- 移除 `dailynoteEnabled` useEffect（与 SettingsForm 中的联动逻辑重复且冲突）
- `dailynoteEnabled` prop 仅用于判断 DailyNote 行是否可删除，不再用于自动添加/移除 DailyNote

### Requirement: SettingsForm 勾选框顺序

原顺序为：Show Review Mode Borders → RTL Enabled → Shuffle Cards → Enable DailyNote Deck → Auto Collapse Blocks。修改为：Enable DailyNote Deck → Shuffle Cards → Auto Collapse Blocks After Review → Show Review Mode Borders → RTL Enabled。

## REMOVED Requirements

### Requirement: DeckConfigsTable 中的 dailynoteEnabled useEffect
**Reason**: 该 useEffect 在组件挂载时使用过时的空 `decks` 状态，将 deckConfigs 覆盖为仅含 DailyNote 的数组，导致加载和持久化 Bug。SettingsForm 中的 dailynoteEnabled checkbox onChange 已经正确处理了 DailyNote 的添加/移除逻辑。
**Migration**: 移除 DeckConfigsTable 中的 `dailynoteEnabled` useEffect，DailyNote 的添加/移除完全由 SettingsForm 控制
