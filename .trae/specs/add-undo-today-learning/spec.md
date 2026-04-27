# 撤销今日学习 Spec

## Why

当前系统在用户对同日已学卡片重新评分时，采用"静默覆盖 + 浮层提醒"模式：`OverwriteReminder` 仅提示"今日已学习，此次学习将覆盖今日数据"2.5 秒后消失，用户无法主动控制是否覆盖。这违反了"用户自主控制"原则——软件替用户做了覆盖决策，而非让用户选择。此外，覆盖判断系统（`isReScoring` / `isChildReScoring` / `showOverwriteReminder`）散布在多处，增加了维护成本。

## What Changes

- 新增"撤销今日学习"按钮：今日已完成学习的卡片底部按钮栏替换为该按钮
- 新增 `undoTodaySession` 数据层函数：删除同日 session block，回退到前日状态
- 移除 `OverwriteReminder` 组件及 `showOverwriteReminder` 状态
- 移除 `isReScoring` / `isChildReScoring` 覆盖判断逻辑
- 修改 Footer 渲染逻辑：新增"今日已完成"分支
- 修改 `savePracticeData`：移除同日覆盖逻辑，今日已有记录时始终创建新 block（由撤销机制保证一致性）

## Impact

- Affected specs: 评分系统交互流程、同日重评逻辑、数据存储策略
- Affected code:
  - `src/components/overlay/Footer.tsx` — 新增 `CompletedTodayControls` 组件
  - `src/components/overlay/PracticeOverlay.tsx` — 移除覆盖判断，新增撤销回调
  - `src/queries/save.ts` — 简化同日处理逻辑
  - `src/queries/data.ts` — 新增 `undoTodaySession` 导出函数
  - `src/hooks/useLineByLineReview.ts` — 移除 `isChildReScoring`，适配撤销逻辑

---

## ADDED Requirements

### Requirement: 撤销今日学习按钮

当卡片在当前算法下今日已完成学习时，系统 SHALL 将底部按钮栏替换为"撤销今日学习"按钮，清晰传达：当前卡片在所选算法下今日已完成学习，用户可点击撤销并重新学习。

#### Scenario: SM2 卡片今日已完成

- **GIVEN** 一张 SM2 算法卡片今日已评分（非 Forgot）
- **WHEN** 用户导航回该卡片
- **THEN** 底部按钮栏显示"撤销今日学习"按钮，而非 Forgot/Hard/Good/Perfect 按钮
- **AND** 按钮文案包含算法名称，如"撤销今日学习 (SM2)"

#### Scenario: Progressive 卡片今日已完成

- **GIVEN** 一张 Progressive 算法卡片今日已点击 Next
- **WHEN** 用户导航回该卡片
- **THEN** 底部按钮栏显示"撤销今日学习"按钮，而非 Next 按钮

#### Scenario: FixedTime 卡片今日已完成

- **GIVEN** 一张 FixedTime 算法卡片今日已点击 Next
- **WHEN** 用户导航回该卡片
- **THEN** 底部按钮栏显示"撤销今日学习"按钮

#### Scenario: LBL 子行今日已完成

- **GIVEN** LBL 模式下一个子行今日已完成学习
- **WHEN** 用户导航回该子行
- **THEN** 该子行底部显示"撤销今日学习"按钮

### Requirement: 撤销操作执行

系统 SHALL 提供 `undoTodaySession` 函数，删除同日 session block 并回退到前日状态。

#### Scenario: 撤销非 Forgot 的今日学习记录

- **GIVEN** 卡片今日有一条非 Forgot 的 session block
- **WHEN** 用户点击"撤销今日学习"
- **THEN** 系统删除该同日 session block
- **AND** 卡片状态回退到前日（或更早）的 session 数据
- **AND** 底部按钮栏恢复为评分按钮（Forgot/Hard/Good/Perfect 或 Next）
- **AND** 卡片重新出现在今日待复习队列中

#### Scenario: 撤销 Forgot 后的今日学习记录链

- **GIVEN** 卡片今日有 Forgot session block 和后续非 Forgot session block
- **WHEN** 用户点击"撤销今日学习"
- **THEN** 系统删除同日所有 session block（Forgot + 后续）
- **AND** 卡片状态回退到前日的 session 数据
- **AND** 底部按钮栏恢复为评分按钮

#### Scenario: 撤销后重新学习

- **GIVEN** 用户已撤销今日学习
- **WHEN** 用户重新评分
- **THEN** 系统创建新的 session block（与首次学习流程一致）
- **AND** `resolveBaseForCalculation` 基于前日数据计算（无同日记录需要回退）

### Requirement: 算法独立性

撤销操作 SHALL 仅影响当前选中算法的学习记录，切换算法不应影响原算法的学习完成状态。

#### Scenario: SM2 完成后切换到 Progressive

- **GIVEN** 卡片在 SM2 算法下今日已完成学习
- **WHEN** 用户切换算法为 Progressive
- **THEN** SM2 的学习完成状态不受影响
- **AND** Progressive 算法下显示 Next 按钮（Progressive 今日未学习）
- **WHEN** 用户切换回 SM2
- **THEN** 底部按钮栏显示"撤销今日学习"按钮（SM2 今日已完成）

#### Scenario: 撤销仅影响当前算法

- **GIVEN** 卡片在 SM2 和 Progressive 下今日都已完成学习
- **WHEN** 用户在 SM2 算法下点击"撤销今日学习"
- **THEN** 仅 SM2 的同日 session 被删除
- **AND** Progressive 的同日 session 不受影响

**注意**：当前数据模型中，session block 不区分算法——每个 session block 包含所有算法的字段。因此"撤销仅影响当前算法"在现有架构下无法直接实现。本需求降级为：撤销操作删除同日 session block，回退到前日状态。前日 session 中所有算法字段均被保留，切换算法后各算法的历史数据不受影响。

---

## MODIFIED Requirements

### Requirement: 同日重评交互（原"覆盖提醒"机制）

**原行为**：同日重评时显示 `OverwriteReminder` 浮层提示"今日已学习，此次学习将覆盖今日数据"，2.5 秒后消失，评分直接覆盖。

**新行为**：同日已完成的卡片底部显示"撤销今日学习"按钮，用户必须先撤销才能重新评分。移除 `OverwriteReminder`、`showOverwriteReminder`、`isReScoring`、`isChildReScoring`。

#### Scenario: 今日已完成卡片导航回看

- **GIVEN** 卡片今日已完成学习
- **WHEN** 用户通过 ◀/▶ 导航回到该卡片
- **THEN** 底部显示"撤销今日学习"按钮
- **AND** 不显示 OverwriteReminder 浮层

### Requirement: savePracticeData 同日处理

**原行为**：同日已有 session block 时，更新标题并删除旧子字段后重写（Forgot 保留除外）。

**新行为**：同日已有 session block 时，始终创建新 session block（不再覆盖）。撤销操作负责清理旧记录，保证数据一致性。

#### Scenario: 同日非 Forgot 记录已存在，新评分写入

- **GIVEN** 卡片今日已有非 Forgot session block
- **WHEN** 用户撤销后重新评分
- **THEN** 系统创建新的 session block（不覆盖旧 block）
- **AND** 旧 block 已在撤销时被删除，因此不会产生重复

#### Scenario: 同日 Forgot 记录已存在，新评分写入

- **GIVEN** 卡片今日已有 Forgot session block
- **WHEN** Forgot 重插后用户再次评分
- **THEN** 系统创建新的 session block（Forgot block 保留）
- **AND** `parseLatestSession` 正确设置 `baseSessionData` 指向 Forgot block

---

## REMOVED Requirements

### Requirement: OverwriteReminder 覆盖提醒

**Reason**：被"撤销今日学习"按钮取代。用户不再需要被动接受覆盖，而是主动选择撤销后重新学习。

**Migration**：删除 `OverwriteReminder` styled component、`showOverwriteReminder` state、`isReScoring` 判断、`isChildReScoring` 判断。

### Requirement: savePracticeData 同日覆盖写入

**Reason**：撤销机制保证同日不会产生重复记录（撤销时删除旧记录），因此 savePracticeData 不再需要覆盖逻辑。同日已有 block 时始终创建新 block。

**Migration**：简化 `savePracticeData`，移除 `todayBlock` 的覆盖更新逻辑和 `shouldPreserveForgot` 判断。同日已有 block 时直接创建新 block。
