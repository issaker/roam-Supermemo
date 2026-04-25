# LBL 架构整改：交互模式边界 + 行渲染控制 + SM2 交互逻辑 Spec

## Why

当前 LBL 模式存在三个架构层面的问题，需要系统性整改：

1. **交互模式边界错误**：`InteractionSelector` 在 LBL 子 block 视图中仍可操作，但交互模式是父级属性，子 block 不应有交互模式字段。交互模式切换应直接作用于父级卡片，且选择器始终显示父级属性。
2. **行渲染控制不完整**：上翻行时下方行仍然可见（应隐藏），导致用户无法获得"逐行揭示"的体验。
3. **SM2 算法交互逻辑缺失**：LBL 模式下切换到 SM2 时，应自动回退到上一行并隐藏 SM2 行，用户点击 Show Answer 后才揭示 SM2 行并显示评分按钮。当前 Show Answer 影响的是下一行而非当前行。

## What Changes

- **交互模式完全解耦**：LBL 子 block 不存储/读取交互模式字段；InteractionSelector 始终显示父级属性；切换交互模式直接作用于父级卡片
- **行渲染控制**：▲ 上翻行时隐藏当前行下方所有行（`revealedCount = newIndex + 1`）；▼ 下翻行时正常逐行渲染目标行
- **SM2 算法交互逻辑**：LBL 模式下切换到 SM2 时自动回退一行并隐藏 SM2 行；Show Answer 在此场景下揭示 SM2 行并推进到该行
- **`lineByLineRevealedCount` 语义修正**：始终 >= `currentChildIndex + 1`，确保当前行被渲染
- **文档与注释**：补充交互模式作用范围说明和 SM2 交互逻辑说明

## Impact

- Affected code:
  - `src/hooks/useLineByLineReview.ts` — revealedCount 语义、onLineByLineShowAnswer 作用域、新增 SM2 切换回调
  - `src/components/overlay/Footer.tsx` — InteractionSelector 显示逻辑
  - `src/components/overlay/PracticeOverlay.tsx` — onSelectAlgorithm 中 SM2 切换处理、setShowAnswers useEffect
  - `README.md` — 交互模式作用范围说明

---

## 架构原则

### 交互模式是父级属性

```
父 block (一级队列卡片):
  - algorithm: 可切换 (SM2/Progressive/FixedTime)
  - interaction: 可切换 (Normal/LBL) ← 仅在父级可切换
  - InteractionSelector 始终显示父级的 interaction

子 block (二级队列卡片):
  - algorithm: 可切换 (SM2/Progressive/FixedTime) ← 每行独立
  - interaction: 固定为 NORMAL ← 不存储、不读取、不切换
  - 子 block 转为独立卡片时，默认初始化为 NORMAL 交互模式
```

### 行渲染控制

```
▲ 上翻行: revealedCount = newIndex + 1  (隐藏下方所有行)
▼ 下翻行: revealedCount = max(prev, newIndex + 1)  (逐行渲染目标行)
```

不变量：`lineByLineRevealedCount >= lineByLineCurrentChildIndex + 1`

### SM2 算法在 LBL 模式下的交互逻辑

SM2 是问答算法，在 LBL 模式下需要特殊的交互流程：

```
切换到 SM2:
  1. 如果当前行 > 0: 回退到上一行（▲），隐藏 SM2 行
  2. 如果当前行 = 0: 保持位置，隐藏答案
  3. 显示 Show Answer 按钮

点击 Show Answer:
  1. 如果下一行是隐藏的 SM2 行: 推进到该行，揭示内容，显示评分按钮
  2. 否则: 显示当前行的答案
```

**此交互逻辑仅适用于 LBL 模式**。Normal 卡片的 SM2 切换仅影响当前卡片的隐藏/重答功能，维持现有正确效果。

**未来添加类似 SM2 的问答算法时**，在 LBL 模式下必须注意此交互逻辑：切换到问答算法时应回退一行并隐藏，Show Answer 应揭示并推进到问答行。

---

## ADDED Requirements

### Requirement: 交互模式与二级队列完全解耦

系统 SHALL 确保交互模式属性仅适用于一级队列卡片，二级队列卡片与交互模式完全解耦。

#### Scenario: LBL 模式下 InteractionSelector 显示父级属性
- **WHEN** 用户在 LBL 模式下查看子 block
- **THEN** InteractionSelector 显示父级卡片的交互模式（LBL）
- **AND** 切换交互模式直接作用于父级卡片

#### Scenario: LBL 模式下 AlgorithmSelector 显示子 block 属性
- **WHEN** 用户在 LBL 模式下查看子 block
- **THEN** AlgorithmSelector 显示当前子 block 的算法
- **AND** 切换算法作用于当前子 block

#### Scenario: 子 block 不存储交互模式字段
- **WHEN** 系统保存子 block 的 session 数据
- **THEN** 不包含 interaction 字段（或始终为 NORMAL）
- **AND** 子 block 的 interaction 不影响任何逻辑

#### Scenario: 子 block 转为独立卡片时默认 NORMAL
- **WHEN** 子 block 被转换为独立的一级队列卡片
- **THEN** 系统将其识别为包含子内容的父级卡片
- **AND** 按当前系统设置默认初始化为 NORMAL 交互模式

### Requirement: 上翻行隐藏下方所有行

系统 SHALL 在上翻行时隐藏当前行下方所有行，实现逐行揭示效果。

#### Scenario: ▲ 上翻行隐藏下方行
- **WHEN** 用户按 ▲ 从第 N 行回到第 N-1 行
- **THEN** `lineByLineRevealedCount = N`（第 N-1 行可见，第 N 行及以下隐藏）
- **AND** 只有第 0 到 N-1 行被渲染

#### Scenario: ▼ 下翻行逐行渲染
- **WHEN** 用户按 ▼ 从第 N 行前进到第 N+1 行
- **THEN** `lineByLineRevealedCount >= N+2`（第 N+1 行可见）
- **AND** 第 N+1 行正常渲染

### Requirement: LBL 模式下 SM2 算法切换交互逻辑

系统 SHALL 在 LBL 模式下切换到 SM2 算法时，自动回退到上一行并隐藏 SM2 行，用户点击 Show Answer 后揭示 SM2 行并显示评分按钮。

#### Scenario: 切换到 SM2 时回退一行（当前行 > 0）
- **WHEN** 用户在 LBL 模式下将当前子 block 的算法从非 SM2 切换到 SM2
- **AND** `lineByLineCurrentChildIndex > 0`
- **THEN** 系统自动回退到上一行（`lineByLineCurrentChildIndex - 1`）
- **AND** SM2 行被隐藏（`lineByLineRevealedCount = lineByLineCurrentChildIndex + 1`，不包含 SM2 行）
- **AND** 显示 Show Answer 按钮（`showAnswers = false`）

#### Scenario: 切换到 SM2 时在第一行（当前行 = 0）
- **WHEN** 用户在 LBL 模式下将第一个子 block 的算法切换到 SM2
- **AND** `lineByLineCurrentChildIndex === 0`
- **THEN** 保持当前位置
- **AND** 隐藏答案（`showAnswers = false`）
- **AND** 显示 Show Answer 按钮

#### Scenario: Show Answer 揭示隐藏的 SM2 行
- **WHEN** 用户在 LBL 模式下点击 Show Answer
- **AND** 下一行是隐藏的 SM2 行（`lineByLineRevealedCount <= lineByLineCurrentChildIndex + 1`）
- **THEN** 推进到 SM2 行（`lineByLineCurrentChildIndex + 1`）
- **AND** 揭示 SM2 行（`lineByLineRevealedCount = lineByLineCurrentChildIndex + 2`）
- **AND** 显示答案和评分按钮（`showAnswers = true`）

#### Scenario: Show Answer 显示当前行答案（正常 SM2 流程）
- **WHEN** 用户在 LBL 模式下点击 Show Answer
- **AND** 当前行是 SM2 且下一行不是隐藏的 SM2 行
- **THEN** 显示当前行的答案（`showAnswers = true`）
- **AND** 显示评分按钮

#### Scenario: SM2 交互逻辑仅在 LBL 模式下生效
- **WHEN** 用户在 Normal 模式下切换到 SM2 算法
- **THEN** 仅影响当前卡片的隐藏/重答功能
- **AND** 不触发回退行或隐藏行的行为
- **AND** 维持现有正确效果

### Requirement: lineByLineRevealedCount 始终包含当前行

系统 SHALL 确保 `lineByLineRevealedCount` 始终 >= `lineByLineCurrentChildIndex + 1`。

#### Scenario: 初始定位时 revealedCount 包含当前行
- **WHEN** 用户翻到一张 LBL 卡片
- **THEN** `lineByLineRevealedCount = firstDueIndex + 1`
- **AND** 无论算法类型，当前行都被渲染

#### Scenario: 评分后 revealedCount 包含新的当前行
- **WHEN** 用户评分后自动推进到下一个到期子 block
- **THEN** `lineByLineRevealedCount >= 新的 lineByLineCurrentChildIndex + 1`

### Requirement: 交互模式作用范围文档化

系统 SHALL 在代码注释和 README 中明确说明交互模式仅对一级队列产生影响。

#### Scenario: 代码注释说明交互模式作用范围
- **WHEN** 开发者阅读相关代码
- **THEN** 能找到明确注释说明交互模式仅对一级队列产生影响，不对二级队列产生影响

#### Scenario: README 说明交互模式作用范围
- **WHEN** 开发者阅读 README
- **THEN** 能找到专门强调交互模式作用范围的设计原则

#### Scenario: README 说明 SM2 在 LBL 下的交互逻辑
- **WHEN** 开发者阅读 README
- **THEN** 能找到 SM2 算法在 LBL 模式下的特殊交互逻辑说明
- **AND** 能找到未来添加问答算法时的注意事项

## MODIFIED Requirements

### Requirement: useLineByLineReview 初始定位 revealedCount

旧实现区分 LblNext/SM2 设置不同的 revealedCount，现统一为 `firstDueIndex + 1`。

### Requirement: onLineByLineShowAnswer 行为

旧实现简单将 revealedCount 加 1，可能揭示错误的行。现改为：如果下一行是隐藏的 SM2 行则推进并揭示；否则显示当前行答案。

### Requirement: onLineByLinePrev 行为

旧实现使用 `Math.max(prev, newIndex + 1)` 保留下方行的可见性。现改为 `newIndex + 1`，隐藏下方所有行。

### Requirement: GradingControlsWrapper 选择器显示

旧实现始终显示 AlgorithmSelector 和 InteractionSelector。现改为 InteractionSelector 始终显示父级属性，但在 LBL 模式下切换交互模式作用于父级卡片。

### Requirement: onSelectAlgorithm SM2 切换处理

旧实现仅更新子 block 的算法数据。现改为：LBL 模式下切换到 SM2 时，还需触发回退行和隐藏行逻辑。

## REMOVED Requirements

无移除的需求。
