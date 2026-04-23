# LBL 模式算法作用域修复 Spec

## Why

LBL（逐行）模式下，切换算法会修改父级 block 的 algorithm，导致所有子 block 被迫使用同一算法。当用户在最后一个子 block 切换算法时，`isLblNext` 全局标志变化触发 `useLineByLineReview` 的 useEffect 重新计算子行索引，因 `childSessionData` 未及时更新而已回答的子行仍显示为"到期"，导致回退到已回答的子行并将其算法覆盖。完成后重启会话或翻页时，因父级算法与子行数据不一致，`lineByLineIsCardComplete` 或 `isDone` 判定异常，出现不该出现的 "Continue Cramming" 按钮。

核心设计原则：**Interaction（NORMAL/LBL）是父级属性，决定卡片如何复习；Algorithm（SM2/PROGRESSIVE/FIXED_TIME）是子级属性，决定每个子 block 如何调度。** 父级的 algorithm 仅作为新子 block 的默认值。

## What Changes

- **`useLineByLineReview` 算法来源改为当前子 block**：`onLineByLineGrade` 使用当前子 block 自身的 algorithm（从 `childSessionData` 获取），而非父级的 algorithm；新子 block（无 session 数据）继承父级 algorithm 作为默认值
- **`isLblNext` 改为逐子 block 计算**：不再基于父级 algorithm 全局判断，而是基于当前子 block 的 algorithm 决定 UI 流程（Show Answer + Grade vs Read + Next）
- **`onSelectAlgorithm` 在 LBL 模式下修改当前子 block**：更新当前子 block 的 algorithm 并持久化，不修改父级的 algorithm
- **`childSessionData` 在评分后即时更新**：`onLineByLineGrade` 完成后同步更新 `childSessionData` state，避免后续计算使用过期数据
- **Footer 算法选择器在 LBL 模式下显示当前子 block 的算法**：`intervalEstimates` 和 `isLblNextActive` 基于当前子 block 的 algorithm 计算
- **`effectiveBaseCardData` 使用当前子 block 的 algorithm**：间隔预估基于当前子 block 的算法和字段
- **移除 `isLblNext` 对 useEffect 的依赖**：`lineByLineCurrentChildIndex` 的初始化不再受 `isLblNext` 变化影响

## Impact

- Affected specs: optimize-compat-lbl-docs（LBL Forgot 重插入逻辑）、ux-review-refactor（Algorithm × Interaction 正交设计）
- Affected code:
  - `src/hooks/useLineByLineReview.ts` — 核心修改：算法来源、isLblNext 作用域、childSessionData 更新
  - `src/components/overlay/PracticeOverlay.tsx` — onSelectAlgorithm LBL 分支、effectiveBaseCardData、showAnswers 逻辑、Footer props
  - `src/components/overlay/Footer.tsx` — isLblNextActive 基于当前子 block 算法、intervalEstimates 数据源

## ADDED Requirements

### Requirement: LBL 模式下算法作用于当前子 block

系统 SHALL 在 LBL 模式下，将算法（Algorithm）视为当前子 block 的属性，而非父级 block 的属性。每个子 block 拥有独立的算法，父级 algorithm 仅作为新子 block 的默认值。

#### Scenario: 评分使用子 block 自身算法
- **WHEN** 用户在 LBL 模式下对某子 block 评分
- **THEN** 系统使用该子 block 自身的 `algorithm`（从 `childSessionData` 获取）计算复习数据
- **AND** 若子 block 无 session 数据，使用父级 `algorithm` 作为默认值

#### Scenario: 切换算法仅影响当前子 block
- **WHEN** 用户在 LBL 模式下切换算法
- **THEN** 仅修改当前子 block 的 algorithm 并持久化到数据页
- **AND** 父级 block 的 algorithm 保持不变

#### Scenario: 不同子 block 可使用不同算法
- **WHEN** LBL 卡片的子 block 1 使用 SM2 算法，子 block 2 使用 PROGRESSIVE 算法
- **THEN** 子 block 1 的评分按 SM2 逻辑计算，子 block 2 的评分按 PROGRESSIVE 逻辑计算
- **AND** 两者的调度数据互不干扰

### Requirement: isLblNext 基于当前子 block 算法计算

系统 SHALL 将 `isLblNext` 从全局标志改为基于当前子 block 算法的逐行判断，决定当前子 block 的 UI 流程。

#### Scenario: 当前子 block 为 SM2 时显示评分按钮
- **WHEN** LBL 模式下当前子 block 的 algorithm 为 SM2
- **THEN** Footer 显示评分按钮（Forgot/Hard/Good/Perfect）
- **AND** 需要先 Show Answer 再评分

#### Scenario: 当前子 block 为 PROGRESSIVE 时显示 Read+Next
- **WHEN** LBL 模式下当前子 block 的 algorithm 为 PROGRESSIVE 或 FIXED_TIME
- **THEN** Footer 显示 Read + Next 按钮
- **AND** 无需评分，直接推进

#### Scenario: 子 block 切换算法后 UI 即时更新
- **WHEN** 用户将当前子 block 的算法从 SM2 切换为 PROGRESSIVE
- **THEN** Footer 从评分按钮切换为 Read + Next 按钮
- **AND** 不触发子行索引重新计算（不回退到之前的子 block）

### Requirement: childSessionData 在评分后即时更新

系统 SHALL 在 `onLineByLineGrade` 完成后即时更新 `childSessionData` state，确保后续计算（如 `findNextDueChildIndex`）使用最新数据。

#### Scenario: 评分后子行索引计算正确
- **WHEN** 用户在 LBL 模式下对子 block 0 评分
- **THEN** `childSessionData` 立即更新子 block 0 的 session 数据
- **AND** 后续 `findNextDueChildIndex` 调用使用更新后的数据

#### Scenario: 切换算法不导致回退
- **WHEN** 用户在最后一个子 block 切换算法
- **THEN** `lineByLineCurrentChildIndex` 不回退到已回答的子 block
- **AND** 因为 `childSessionData` 已包含已回答子 block 的最新 nextDueDate

### Requirement: onSelectAlgorithm 在 LBL 模式下修改当前子 block

系统 SHALL 在 LBL 模式下，将 `onSelectAlgorithm` 的操作目标从父级 block 改为当前子 block。

#### Scenario: LBL 模式切换算法持久化到子 block
- **WHEN** 用户在 LBL 模式下切换算法为 PROGRESSIVE
- **THEN** 调用 `updateReviewConfig` 时 `refUid` 为当前子 block 的 UID
- **AND** 父级 block 的 algorithm 字段不被修改

#### Scenario: LBL 模式切换算法乐观更新子 block
- **WHEN** 用户在 LBL 模式下切换算法
- **THEN** `sessionOverrides` 更新当前子 block 的 algorithm
- **AND** `childSessionData` 同步更新当前子 block 的 algorithm
- **AND** `cardMeta` 的 algorithm 更新为当前子 block 的新算法（驱动 Footer UI 更新）

#### Scenario: Normal 模式切换算法行为不变
- **WHEN** 用户在 Normal 模式下切换算法
- **THEN** 行为与当前一致，修改父级 block 的 algorithm

### Requirement: LBL 模式下间隔预估基于当前子 block

系统 SHALL 在 LBL 模式下，将 Footer 的间隔预估（intervalEstimates）和 `effectiveBaseCardData` 基于当前子 block 的算法和字段计算。

#### Scenario: SM2 子 block 显示 SM2 间隔预估
- **WHEN** 当前子 block 的 algorithm 为 SM2
- **THEN** Footer 的 intervalEstimates 基于 SM2 字段（sm2_eFactor, sm2_repetitions 等）计算
- **AND** 显示 Forgot/Hard/Good/Perfect 各等级的间隔预估

#### Scenario: PROGRESSIVE 子 block 显示 Progressive 间隔预估
- **WHEN** 当前子 block 的 algorithm 为 PROGRESSIVE
- **THEN** Footer 的 intervalEstimates 基于 progressive_repetitions 计算
- **AND** 显示 Read + Next 按钮和间隔信息

### Requirement: lineByLineCurrentChildIndex 初始化不受 isLblNext 影响

系统 SHALL 确保 `lineByLineCurrentChildIndex` 的初始化仅依赖 `childSessionData` 中的到期数据，不受 `isLblNext`（父级算法）变化的影响。

#### Scenario: 切换算法不触发索引重置
- **WHEN** 用户在 LBL 模式下切换当前子 block 的算法
- **THEN** `lineByLineCurrentChildIndex` 不因算法切换而重新计算
- **AND** 当前子 block 位置保持不变

## MODIFIED Requirements

### Requirement: useLineByLineReview Hook 算法来源

旧实现使用父级 `algorithm` 参数作为所有子 block 的算法，现改为从 `childSessionData[childUid].algorithm` 获取当前子 block 的算法，父级 `algorithm` 仅作为新子 block 的默认值。

### Requirement: onSelectAlgorithm 回调行为

旧实现在所有模式下都修改父级 block 的 algorithm，现改为在 LBL 模式下修改当前子 block 的 algorithm，Normal 模式下行为不变。

### Requirement: Footer isLblNextActive 判定

旧实现基于父级 `algorithm` 和 `interaction` 全局判定 `isLblNextActive`，现改为在 LBL 模式下基于当前子 block 的 algorithm 判定。

## REMOVED Requirements

无移除的需求。
