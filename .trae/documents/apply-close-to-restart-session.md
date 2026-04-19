# 计划：将 "Apply & Close" 改为自动重启会话

## 问题分析

当前 "Apply & Close" 按钮的行为：
1. 保存所有设置（`updateSetting`）
2. 关闭设置对话框（`setShowSettings(false)`）
3. 关闭整个练习覆盖层（`onCloseCallback()` → `setShowPracticeOverlay(false)`）

关闭后用户必须**手动重新打开**覆盖层，新设置才能生效。

## 目标

将 "Apply & Close" 改为 "Apply & Restart"：保存设置后自动重启会话（卸载并重新挂载覆盖层），无需用户手动重新打开。

## 实施方案：基于 Key 的组件重挂载机制

利用 React 的 `key` 属性机制：当 `key` 变化时，React 会卸载旧组件并挂载新组件，实现完整的会话重启，同时 `showPracticeOverlay` 保持为 `true`，覆盖层不会消失。

### 步骤 1：修改 `app.tsx`

- 新增 `overlayKey` 状态（初始值 0）
- 新增 `onRestartPracticeOverlayCallback` 回调：递增 `overlayKey` + 调用 `refreshData()`
- 在 `<PracticeSessionProvider>` 上添加 `key={overlayKey}`，使 key 变化时整个组件树重挂载
- 将 `onRestartCallback` 传递给 `<PracticeOverlay>`

### 步骤 2：修改 `PracticeOverlay.tsx`

- 在 `Props` 接口中新增 `onRestartCallback: () => void`
- 从 props 中解构 `onRestartCallback`
- 在 `handleApplyAndClose` 中，将 `onCloseCallback()` 替换为 `onRestartCallback()`

### 步骤 3：修改 `SettingsDialog.tsx`

- 将按钮文字从 "Apply & Close" 改为 "Apply & Restart"，以反映新行为

## 涉及文件

| 文件 | 修改内容 |
|------|---------|
| [app.tsx](file:///Users/a123/Documents/chengxu project/roam-memo-main/src/app.tsx) | 添加 overlayKey 状态、onRestartCallback、key 属性 |
| [PracticeOverlay.tsx](file:///Users/a123/Documents/chengxu project/roam-memo-main/src/components/overlay/PracticeOverlay.tsx) | 添加 onRestartCallback prop，替换 onCloseCallback 调用 |
| [SettingsDialog.tsx](file:///Users/a123/Documents/chengxu project/roam-memo-main/src/components/overlay/SettingsDialog.tsx) | 更新按钮文字 |

## 数据流（修改后）

```
用户点击 "Apply & Restart"
    │
    ▼
SettingsDialog.handleApplyAndClose()
    │  从 formRef 获取表单设置
    ▼
PracticeOverlay.handleApplyAndClose(formSettings)
    │
    ├── 1. 遍历 formSettings，逐个调用 updateSetting(key, value)
    │       → extensionAPI 立即写入 + React 状态更新 + 防抖页面同步
    │
    ├── 2. setShowSettings(false)  ← 关闭设置对话框
    │
    └── 3. onRestartCallback()    ← 重启会话（而非关闭）
            │
            ▼
        App.onRestartPracticeOverlayCallback()
            ├── setOverlayKey(prev => prev + 1)  ← 触发组件树重挂载
            └── refreshData()                     ← 刷新缓存和练习数据
            
        React 处理批量状态更新：
        ├── 新设置生效（useSettings 状态已更新）
        ├── overlayKey 变化 → PracticeSessionProvider + PracticeOverlay 完全重挂载
        └── 覆盖层保持可见，用户无需手动重新打开
```
