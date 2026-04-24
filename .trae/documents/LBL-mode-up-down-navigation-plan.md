# LBL 模式上下翻行导航功能实施计划

## 一、功能概述

在 LBL（Line by Line）模式中新增「向上翻到上一行」和「向下翻到下一行」导航功能，允许用户在子 block 之间自由跳转和重新学习，与现有的左右翻页（卡片级导航）形成并行的导航系统。

---

## 二、现有架构分析

### 2.1 LBL 模式导航现状
- **左右翻页（卡级别）**：通过 `cardQueue` + `currentIndex` 实现卡片间导航，已在 `PracticeOverlay.tsx` 中实现 `onPrevClick()` / `onSkipClick()`
- **子 block 自动前进**：`useLineByLineReview.ts` 中的 `onLineByLineGrade()` 在评分后自动查找下一个到期子 block，使用 `findNextDueChildIndex()` 函数
- **子 block 当前状态**：`lineByLineCurrentChildIndex` 和 `lineByLineRevealedCount` 管理当前子 block 位置

### 2.2 现有状态变量
- `lineByLineCurrentChildIndex`：当前正在学习的子 block 索引
- `lineByLineRevealedCount`：已显示的子 block 数量（用于 Answer 展开控制）
- `lineByLineIsCardComplete`：当 `lineByLineCurrentChildIndex >= childUidsList.length` 时为 true
- `childSessionData`：每个子 block 的学习会话数据

### 2.3 学习记录覆盖机制
- `savePracticeData()` 支持**同日去重覆盖**：如果当天已有 session 块，会更新 emoji 并重写所有子字段
- 这已经天然支持重新评分覆盖 — 同一子 block 在同一天被重新评分时，旧数据会被完整覆盖
- 跨天数据不会被覆盖（不同日期创建新的 session 块）

---

## 三、实施步骤

### 步骤 1：修改 `useLineByLineReview.ts` — 添加上下翻行导航逻辑

在 `UseLineByLineReviewOutput` 接口中新增两个方法：

#### 1.1 `onLineByLineUp()` — 向上翻到上一行
- **功能**：将 `lineByLineCurrentChildIndex` 减 1，回退到前一个子 block
- **边界处理**：如果当前已在第一个子 block（`index === 0`），不做任何操作
- **显示控制**：确保目标子 block 已被 reveal（`lineByLineRevealedCount` 保持足够大）
- **状态重置**：重置 `showAnswers` 为 false，让用户可以重新操作（Show Answer → 评分）
- **不保存/修改当前子 block 的学习记录** — 只是导航，评分由用户后续操作决定

#### 1.2 `onLineByLineDown()` — 向下翻到下一行
- **功能**：将 `lineByLineCurrentChildIndex` 加 1，跳到下一个子 block
- **边界处理**：如果当前已是最后一个子 block，不做任何操作
- **显示控制**：确保下一个子 block 已被 reveal
- **不保存/修改当前子 block 的学习记录** — 只是跳过，评分由用户后续操作决定

#### 1.3 关于 `lineByLineIsCardComplete` 的处理
- 当用户完成所有子 block 后，`lineByLineCurrentChildIndex >= childUidsList.length`，此时 `lineByLineIsCardComplete` 为 true
- 用户按"向上"时，索引回退到 `childUidsList.length - 1`，`lineByLineIsCardComplete` 自动变为 false
- 用户可重新评分最后一个子 block
- 这是**天然支持**的，不需要额外逻辑

### 步骤 2：修改 `Footer.tsx` — 添加上下翻行 UI 按钮

#### 2.1 新建 `LblUpDownControls` 组件
- 样式与现有左右翻页按钮（◀ ▶）完全一致
- 使用 ▲（向上箭头）和 ▼（向下箭头）符号
- 按钮尺寸、交互方式与左右翻页按钮保持一致

#### 2.2 在以下位置嵌入上下翻行按钮

**位置 A：`AnswerHiddenControls` 区域**
- 在 Show Answer 按钮左侧添加上下翻行按钮
- LBL 模式下用户可在显示答案前自由切换子 block

**位置 B：`GradingControlsWrapper` 区域**
- 在 ◀ ▶ 按钮旁边添加上下翻行按钮
- 用户在评分阶段可自由切换子 block
- 布局示例：`[↑] [↓]  [◀] [▶]  [评分按钮...]  [算法选择器] [交互选择器]`

**位置 C：`LblCompletedControls` 区域**
- 在所有子 block 完成后，显示上下翻行按钮让用户回退重学
- 保持现有的 "All lines reviewed" 文字和左右翻页按钮
- 示例：`[↑] [↓]  ◀ [All lines reviewed] ▶`

### 步骤 3：添加快捷键支持

在 Footer 的 `hotkeys` 数组中新增：

| 快捷键 | 功能 | 条件 |
|--------|------|------|
| `up` | 向上翻到上一行 | 仅在 LBL 模式下可用 |
| `down` | 向下翻到下一行 | 仅在 LBL 模式下可用 |

### 步骤 4：修改 `PracticeOverlay.tsx` — 连接上下翻行逻辑

- 从 `useLineByLineReview` 解构新的 `onLineByLineUp` 和 `onLineByLineDown` 方法
- 作为新 props 传递给 Footer 组件
- 在 `MainContext` 中添加上下翻行相关状态（如果需要）

### 步骤 5：完整测试

| 测试场景 | 预期结果 |
|---------|---------|
| SM2 算法下向上翻回到已评分子 block | 子 block 可重新 Show Answer 和评分 |
| Progressive 算法下向下跳过当前子 block | 直接跳到下一个子 block |
| FixedTime 算法下多次上下翻页 | 所有算法都正常工作 |
| 全部子 block 完成后向上翻页 | 可重新访问任意子 block 并重新评分 |
| 重新评分后检查学习记录 | 同日记录被覆盖，字段完整 |
| 上下翻页 + 左右翻页组合操作 | 两个导航系统互不干扰 |
| 键盘上下方向键操作 | 与鼠标点击行为一致 |
| 移动端按钮显示 | 按钮正常显示，触摸操作正常 |

---

## 四、涉及的文件修改清单

| 文件 | 修改内容 |
|------|---------|
| `src/hooks/useLineByLineReview.ts` | 新增 `onLineByLineUp()` 和 `onLineByLineDown()` 方法及返回 |
| `src/components/overlay/Footer.tsx` | 新增上下翻行按钮 UI，添加快捷键，嵌入到各 Controls 组件 |
| `src/components/overlay/PracticeOverlay.tsx` | 解构新方法，作为 props 传递给 Footer，更新 MainContext |

---

## 五、风险评估与注意事项

1. **同日覆盖机制已验证**：`savePracticeData()` 已支持同日覆盖，重新评分时旧数据会被完整替换，无需额外修改
2. **跨天数据不受影响**：上下翻页只是导航，不会修改未评分子 block 的数据
3. **与重插入机制兼容**：上下翻页导航不会触发现有的重插入逻辑（`shouldReinsertLblCard`），这些逻辑只在 `onLineByLineGrade` 中触发
4. **`childSessionData` 状态维护**：当用户回退到已评分子 block 时，`childSessionData` 中保留着该子 block 的上次评分数据，用户再次评分时会通过 `savePracticeData` 覆盖更新
5. **`showAnswers` 重置**：上下翻页时需重置 `showAnswers` 为 false，确保用户在新的子 block 上能看到 Show Answer 按钮（对于非评分算法 + LblNext 模式，`showAnswers` 应保持 true）
