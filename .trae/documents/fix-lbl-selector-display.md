# 修复 LBL 模式下 AlgorithmSelector/InteractionSelector 显示父卡片算法的问题

## 问题描述

LBL 模式下，状态栏的 AlgorithmSelector 和 InteractionSelector 始终显示**父卡片**的 algorithm/interaction（来自 `usePracticeSession()`），而非当前子 block 的 algorithm/interaction。

例如：父卡片 `algorithm:: SM2`，子 block 实际是 Progressive，但状态栏显示 "SM2" + "Normal"，导致用户误以为当前子 block 是 SM2 模式。

## 根因分析

`GradingControlsWrapper` 中的 `AlgorithmSelector` 和 `InteractionSelector` 从 `usePracticeSession()` 获取 `algorithm` 和 `interaction`：

```typescript
const { algorithm, interaction, onSelectAlgorithm, onSelectInteraction } = usePracticeSession();
```

`usePracticeSession()` 返回的是 `PracticeSessionContext` 中的值，由 `PracticeOverlay` 的 `sessionContextValue` 设置：

```typescript
const sessionContextValue = React.useMemo(() => ({
  ...sessionContext,
  algorithm,           // ← 这是父卡片的 algorithm
  interaction,         // ← 这是父卡片的 interaction
  onSelectAlgorithm,
  onSelectInteraction,
}), [...]);
```

这里的 `algorithm` 和 `interaction` 来自 `useCurrentCardData` hook，它解析的是**父卡片**的 session 数据（`latestSession`），不是当前子 block 的。

虽然我们在 Footer 顶层和 GradingControlsWrapper 中引入了 `effectiveAlgorithm` 来控制按钮和快捷键行为，但 **AlgorithmSelector/InteractionSelector 的显示值** 仍然是父卡片的 `algorithm`/`interaction`，没有使用 `effectiveAlgorithm`。

## 修复方案

在 `GradingControlsWrapper` 中，将 `AlgorithmSelector` 和 `InteractionSelector` 的显示值改为 `effectiveAlgorithm` 和 `effectiveInteraction`。

### 具体修改

**文件：`src/components/overlay/Footer.tsx`**

1. 在 `GradingControlsWrapper` 中计算 `effectiveInteraction`：
   ```typescript
   const effectiveInteraction = isLineByLine ? InteractionStyle.NORMAL : interaction;
   ```
   （子 block 的 interaction 始终是 NORMAL，因为子 block 不是 LBL 容器）

2. 将 `AlgorithmSelector` 的 `algorithm` prop 从 `algorithm` 改为 `effectiveAlgorithm`

3. 将 `InteractionSelector` 的 `interaction` prop 从 `interaction` 改为 `effectiveInteraction`

**注意**：`onSelectAlgorithm` 和 `onSelectInteraction` 不需要修改，因为 `PracticeOverlay.onSelectAlgorithm` 已经在 LBL 模式下正确处理了子 block 的算法切换（更新 `childSessionData` 和 `sessionOverrides`）。

### 边界情况

- **Normal 模式**：`effectiveAlgorithm = algorithm`，`effectiveInteraction = interaction`，行为不变
- **LBL 模式**：`effectiveAlgorithm = currentChildAlgorithm || algorithm`，`effectiveInteraction = NORMAL`，显示当前子 block 的算法和交互模式
- **子 block 无 session 数据**：`currentChildAlgorithm` 为 undefined，fallback 到父卡片的 `algorithm`
