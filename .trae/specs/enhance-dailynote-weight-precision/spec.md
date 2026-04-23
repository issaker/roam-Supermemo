# DailyNote 牌组权重集成与精度修复 Spec

## Why

当前 DailyNote 牌组被特殊处理：不在牌组管理表格中显示、无法设置权重和 Swap Q/A、始终置底、从剩余配额获取卡片。这导致权重分配不透明、0 权重牌组仍可能获得卡片、以及 `tagsListString` 迁移代码残留等问题。需要将 DailyNote 完全纳入权重体系，修复精度问题，清理死代码，并增强设置页说明文字。

## What Changes

- 将 DailyNote 牌组纳入 `deckConfigs` 数据模型，使其在牌组管理表格中可见可编辑
- DailyNote 牌组特殊限制：不可删除、不可修改名称，但可上下移动、可编辑 Swap Q/A 和 Weight %
- `dailynoteEnabled` 开关控制 DailyNote 在表格中的出现/消失
- 移除 `useTags` 中 DailyNote 追加逻辑（改为从 deckConfigs 读取）
- 移除 `limitRemainingPracticeData` 中 DailyNote 特殊分支（改为统一权重分配）
- 修复权重为 0 的牌组在重分配阶段仍获得卡片的问题
- 移除 `settings.ts` 中 `tagsListString` 迁移代码
- 增强 SettingsForm 中 Daily Review Limit 和 Weight % 的说明文字

## Impact

- Affected specs: deck-weight-limit-settings-restructure (前序 spec)
- Affected code:
  - `src/components/DeckConfigsTable.tsx` — 新增 DailyNote 特殊行逻辑、dailynoteEnabled prop
  - `src/components/SettingsForm.tsx` — 说明文字增强、dailynoteEnabled 与 deckConfigs 联动
  - `src/hooks/useTags.tsx` — 移除 DailyNote 追加逻辑
  - `src/queries/data.ts` — 移除 DailyNote 特殊分支、修复 weight=0 精度问题
  - `src/queries/settings.ts` — 移除 tagsListString 迁移代码
  - `src/hooks/useSettings.ts` — 更新默认 deckConfigs（含 DailyNote）

## ADDED Requirements

### Requirement: DailyNote 牌组纳入 deckConfigs 管理

系统 SHALL 将 DailyNote 牌组作为 deckConfigs 的一部分进行管理，使其在牌组管理表格中可见可编辑。

#### Scenario: DailyNote 在表格中的显示
- **GIVEN** `dailynoteEnabled` 为 true
- **WHEN** 用户查看牌组管理表格
- **THEN** DailyNote 牌组显示在表格中，名称为 "DailyNote"
- **AND** 名称列显示为纯文本（不可编辑）
- **AND** Swap Q/A 列显示可编辑的复选框
- **AND** Weight % 列显示可编辑的数字输入框

#### Scenario: DailyNote 不可删除
- **GIVEN** DailyNote 牌组在表格中被选中
- **WHEN** 用户点击删除行 (-) 按钮
- **THEN** 删除操作被阻止，DailyNote 牌组保留在表格中

#### Scenario: DailyNote 不可修改名称
- **GIVEN** DailyNote 牌组在表格中
- **WHEN** 用户查看名称列
- **THEN** 名称显示为纯文本 "DailyNote"，无编辑输入框

#### Scenario: DailyNote 可上下移动
- **GIVEN** DailyNote 牌组在表格中被选中
- **WHEN** 用户点击上移 (↑) 或下移 (↓) 按钮
- **THEN** DailyNote 牌组在表格中上移或下移一位
- **AND** 移动后权重不变，仅改变排序位置

#### Scenario: DailyNote 可编辑 Swap Q/A
- **GIVEN** DailyNote 牌组在表格中
- **WHEN** 用户切换 Swap Q/A 复选框
- **THEN** DailyNote 的 swapQA 值更新
- **AND** 变更随 Apply & Restart 统一生效

#### Scenario: DailyNote 可编辑 Weight %
- **GIVEN** DailyNote 牌组在表格中
- **WHEN** 用户修改 Weight % 输入框的值
- **THEN** 其他牌组的权重自动重分配，总和保持 100%

### Requirement: dailynoteEnabled 与 deckConfigs 联动

系统 SHALL 在 `dailynoteEnabled` 开关变更时自动同步 deckConfigs 中的 DailyNote 条目。

#### Scenario: 启用 DailyNote Deck
- **GIVEN** `dailynoteEnabled` 当前为 false，DailyNote 不在 deckConfigs 中
- **WHEN** 用户勾选 "Enable DailyNote Deck" 复选框
- **THEN** DailyNote 条目被添加到 deckConfigs 中
- **AND** 所有牌组（包括 DailyNote）重新均分 100% 权重
- **AND** DailyNote 的 swapQA 默认为 false

#### Scenario: 禁用 DailyNote Deck
- **GIVEN** `dailynoteEnabled` 当前为 true，DailyNote 在 deckConfigs 中
- **WHEN** 用户取消勾选 "Enable DailyNote Deck" 复选框
- **THEN** DailyNote 条目从 deckConfigs 中移除
- **AND** 剩余牌组重新均分 100% 权重

#### Scenario: 默认状态
- **GIVEN** 用户首次安装或重置设置
- **WHEN** `dailynoteEnabled` 默认值确定
- **THEN** 若 `dailynoteEnabled` 为 true，默认 deckConfigs 包含 DailyNote 条目
- **AND** 若 `dailynoteEnabled` 为 false，默认 deckConfigs 不包含 DailyNote 条目

### Requirement: DailyNote 牌组参与权重分配

系统 SHALL 将 DailyNote 牌组与其他牌组同等对待，参与基于权重的每日复习限额分配。

#### Scenario: DailyNote 权重限额计算
- **GIVEN** DailyNote 牌组权重为 W%，全局 Daily Review Limit 为 N
- **WHEN** 系统计算 DailyNote 的每日复习卡片数量
- **THEN** DailyNote 的限额为 `Math.floor(N * (W / 100))`，与其他牌组一致

#### Scenario: DailyNote 不再从剩余配额获取
- **GIVEN** DailyNote 牌组在 deckConfigs 中有权重
- **WHEN** 系统分配每日复习限额
- **THEN** DailyNote 按其权重获得配额，不再从"加权牌组分配后的剩余配额"获取

### Requirement: 权重为 0 时完全关闭牌组配额

系统 SHALL 确保权重设置为 0 的牌组在所有分配阶段均不获得任何卡片配额。

#### Scenario: 权重为 0 的牌组不获得初始配额
- **GIVEN** 某牌组的 Weight % 设置为 0
- **WHEN** 系统进行初始卡片分配
- **THEN** 该牌组的 cap 为 0，不参与卡片选择

#### Scenario: 权重为 0 的牌组不获得重分配配额
- **GIVEN** 某牌组的 Weight % 设置为 0
- **WHEN** 系统进行未用配额重分配
- **THEN** 该牌组仍不获得任何卡片，0 权重代表完全关闭该牌组

#### Scenario: 分析根因
- **WHEN** 分析权重为 0 仍获得卡片的原因
- **THEN** 根因是 `limitRemainingPracticeData` 的重分配阶段未检查权重为 0 的牌组，导致它们在 cap=0 被跳过后，在重分配阶段（已移除 cap 检查）仍能获得卡片
- **AND** 将 DailyNote 纳入权重体系后，DailyNote 不再从剩余配额获取卡片，减少了溢出效应，但 weight=0 的根本修复仍需在重分配阶段加入权重检查

### Requirement: Settings 说明文字增强

系统 SHALL 在 Memo Settings 中增加对 Daily Review Limit 和 Weight % 计算逻辑的说明文字。

#### Scenario: Daily Review Limit 说明文字
- **WHEN** 用户查看 Daily Review Limit 设置项
- **THEN** 说明文字包含：每日复习卡片总数限制，0 表示不限制。设置后，各牌组按 Weight % 比例分配配额。

#### Scenario: Tag Pages (Decks) 说明文字
- **WHEN** 用户查看 Tag Pages (Decks) 设置项
- **THEN** 说明文字包含：每个牌组的 Weight % 决定其在每日复习限额中分得的卡片比例。所有牌组权重之和始终为 100%。权重为 0 表示关闭该牌组的复习配额。

## MODIFIED Requirements

### Requirement: useTags 牌组列表构建

原 `useTags` 在 `dailynoteEnabled` 为 true 时将 `DAILYNOTE_DECK_KEY` 追加到 tagsList 末尾。修改为：

- 移除 DailyNote 追加逻辑
- tagsList 完全从 deckConfigs 解析，DailyNote 的出现/消失由 deckConfigs 中的条目决定
- `dailynoteEnabled` 不再影响 useTags 的行为（由 SettingsForm 在 deckConfigs 层面管理）

### Requirement: limitRemainingPracticeData 算法

原算法对 DailyNote 牌组有特殊分支（跳过 deckCaps、从剩余配额获取）。修改为：

- 移除 `if (tag === DAILYNOTE_DECK_KEY) continue;` 的特殊跳过逻辑
- DailyNote 与其他牌组统一参与权重分配
- 在重分配阶段，跳过权重为 0 的牌组（cap 为 0 的牌组不应获得重分配卡片）

### Requirement: 默认 deckConfigs

原默认值为 `'[{"name":"memo","swapQA":false,"weight":100}]'`。修改为：

- 若 `dailynoteEnabled` 默认为 true：默认值包含 DailyNote 条目，两个牌组各 50% 权重
- 若 `dailynoteEnabled` 默认为 false：默认值不变

## REMOVED Requirements

### Requirement: tagsListString 迁移代码
**Reason**: `deckConfigs` 已完全替代 `tagsListString`，无需保留向后兼容迁移逻辑
**Migration**: 直接移除 `settings.ts` 中的迁移代码块（`if (!loadedSettings.deckConfigs && (loadedSettings as any).tagsListString)` 及其内容）

### Requirement: DailyNote 置底限制
**Reason**: DailyNote 现在可以在牌组管理表格中自由排序，不再强制置底
**Migration**: 移除 `useTags` 中的 `[...parsed, DAILYNOTE_DECK_KEY]` 追加逻辑
