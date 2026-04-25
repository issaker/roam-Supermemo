# LBL 插队机制 Bug 修复 + 设置面板调整 Plan

## Bug 分析

### Bug 1：LBL+Progressive 插队后重新遇到时从第一行开始

**根因**：时序竞争问题。当从非 LBL 卡片切换回重插入的 LBL 卡片时：
1. `currentIndex` 变化 → 触发 useEffect 设置 `needsPositioningRef = true`
2. `isLineByLineActive` 变为 true → `getChildSessionData` useEffect 开始异步加载
3. 但此时 `childSessionData` 可能已被清空为 `{}`（上一张非 LBL 卡片时清空）
4. 定位 useEffect 检测到 `!Object.keys(childSessionData).length` → fallback 到 index 0
5. `needsPositioningRef.current = false`（被消耗掉了）
6. 异步加载完成 → `childSessionData` 更新 → 但定位 useEffect 不再执行（ref 已 false）

**修复方案**：定位 useEffect 在 `childSessionData` 为空时，只设 fallback 但**不消耗** `needsPositioningRef`。让 `needsPositioningRef` 保持 `true`，等 DB 数据加载完成后重新定位。

具体：将 `needsPositioningRef.current = false` 从 useEffect 开头移到 `childSessionData` 有数据的分支中。空数据分支不消耗 ref。

### Bug 2：LBL+SM2 Forgot 插队机制审查

**结论**：Forgot 插队机制逻辑正确。SM2 Forgot 后 `lineByLineCurrentChildIndex` 不变，卡片插队后重新遇到时，`findNextDueChildIndex` 从 index 0 扫描，Forgot 的子 block `nextDueDate` 在过去，会被正确定位到。但同样受 Bug 1 的时序竞争影响——如果 `childSessionData` 为空时过早定位，也会从 index 0 开始（恰好和 Forgot 行一致，但这是巧合而非设计保证）。

**修复**：Bug 1 的修复同时解决 Forgot 插队的时序问题。

### 设置面板调整

1. **Shuffle Cards 移到 Show Review Mode Borders 下面**：调整 SettingsForm.tsx 中字段的渲染顺序
2. **lblNextReinsertOffset 默认值改为 0**：修改 `defaultSettings` 和 `loadSettingsFromPage` 中的 fallback 值。老用户已有持久化设置不受影响（`loadSettingsFromPage` 会从 DB 读取他们的值）

## 实现步骤

### Step 1：修复定位 useEffect 的 needsPositioningRef 消耗时机

文件：`src/hooks/useLineByLineReview.ts`

修改定位 useEffect（约第 184-199 行）：
- 将 `needsPositioningRef.current = false` 从 useEffect 开头移到 `childSessionData` 有数据的分支中
- 空数据分支（fallback 到 index 0）不消耗 ref，保持 `needsPositioningRef.current = true`
- 这样当 DB 数据异步加载完成后，定位 useEffect 会再次执行并正确定位

### Step 2：调整 SettingsForm 字段顺序

文件：`src/components/SettingsForm.tsx`

将 "Shuffle Cards"（第 200-218 行）移到 "Show Review Mode Borders"（第 239-256 行）下面。

当前顺序：... dailynoteEnabled → shuffleCards → autoCollapseBlocks → showModeBorders → rtlEnabled
目标顺序：... dailynoteEnabled → autoCollapseBlocks → showModeBorders → shuffleCards → rtlEnabled

### Step 3：修改 lblNextReinsertOffset 默认值

文件：`src/hooks/useSettings.ts` — 将 `lblNextReinsertOffset: 3` 改为 `lblNextReinsertOffset: 0`
文件：`src/queries/settings.ts` — 将 `Number(value) || 3` 改为 `Number(value) || 0`

### Step 4：验证

运行 `npm run lint` 和 `npm run typecheck`
