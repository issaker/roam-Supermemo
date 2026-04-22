# 自动折叠 Block 功能实现计划

## 问题描述

练习闪卡后，Roam Research 中的 block 都被自动 Expand，导致页面内容很长很乱。需要实现：
1. 练习完的卡片（包括逐行子 block）在 Roam 页面上自动 collapse
2. LBL 模式下，overlay 中只展开当前聚焦的子 block，之前的子 block 折叠
3. 在 Memo Settings 中增加开关，默认开启

## 根因分析

[CardBlock.tsx](file:///Users/a123/Documents/chengxu%20project/roam-memo-main/src/components/overlay/CardBlock.tsx#L76-L84) 在渲染 block 时，会通过 `simulateMouseClick` 强制展开折叠的 block。由于 Roam 的 block 展开/折叠状态存储在数据库中（全局共享），在 overlay 中展开 block 也会导致 Roam 页面上的同一 block 被展开。练习结束后，这些 block 仍然保持展开状态。

## 实现方案

### Step 1: 添加 `autoCollapseBlocks` 设置项

**文件: [useSettings.ts](file:///Users/a123/Documents/chengxu%20project/roam-memo-main/src/hooks/useSettings.ts)**

- 在 `Settings` 类型中添加 `autoCollapseBlocks: boolean`
- 在 `defaultSettings` 中添加 `autoCollapseBlocks: true`
- 在 `SETTING_TYPES` 中添加 `autoCollapseBlocks: 'boolean'`

**文件: [SettingsForm.tsx](file:///Users/a123/Documents/chengxu%20project/roam-memo-main/src/components/SettingsForm.tsx)**

- 在 `SettingsFormSettings` 类型中添加 `autoCollapseBlocks`（从 Settings 中 Omit 掉的键不包含此字段即可）
- 添加 `formSettings` 初始值和同步 effect
- 添加 checkbox UI，标签为 "Auto Collapse Blocks After Review"，说明文字：练习完卡片后自动折叠 Roam 页面上的 block，避免页面内容过长

**文件: [settings.ts](file:///Users/a123/Documents/chengxu%20project/roam-memo-main/src/queries/settings.ts)**

- 在 `saveSettingsToPage` 中添加 `autoCollapseBlocks: settings.autoCollapseBlocks.toString()`
- 在 `loadSettingsFromPage` 的 switch 中添加 `case 'autoCollapseBlocks': loadedSettings.autoCollapseBlocks = value === 'true'; break;`

### Step 2: 创建 `collapseBlockOnPage` 工具函数

**文件: [dom.ts](file:///Users/a123/Documents/chengxu%20project/roam-memo-main/src/utils/dom.ts)**

添加 `collapseBlockOnPage` 函数：
1. 通过 `document.querySelectorAll('textarea[id="' + uid + '"]')` 查找所有匹配的 textarea
2. 过滤掉 overlay dialog 内的 textarea（`element.closest('[role="dialog"]')`）
3. 找到 Roam 页面上的 block 元素（`.closest('.rm-block')`）
4. 检查 block 是否展开（查找 `.rm-caret-open`）
5. 如果展开，调用 `simulateMouseClick` 点击 caret 折叠

```typescript
export const collapseBlockOnPage = (uid: string) => {
  const textareas = document.querySelectorAll(`textarea[id="${uid}"]`);
  for (const textarea of textareas) {
    if (textarea.closest('[role="dialog"]')) continue;
    const block = textarea.closest('.rm-block');
    if (!block) continue;
    const caret = block.querySelector('.rm-caret-open');
    if (caret) simulateMouseClick(caret);
  }
};
```

### Step 3: 创建 `useAutoCollapseBlocks` Hook

**新文件: [useAutoCollapseBlocks.ts](file:///Users/a123/Documents/chengxu%20project/roam-memo-main/src/hooks/useAutoCollapseBlocks.ts)**

核心逻辑：
- 用 `useRef` 追踪已展开的 block UIDs（`expandedBlockUidsRef`）
- 用 `useRef` 追踪前一个卡片的 UID（`prevCardRefUidRef`）
- **卡片切换时**：当 `currentCardRefUid` 变化且前一个 UID 存在时，折叠前一个卡片在 Roam 页面上的 block
- **LBL 模式子 block 切换时**：当 `lineByLineCurrentChildIndex` 变化时，折叠之前的子 block
- **LBL 卡片完成时**：折叠父 block 和所有子 block
- **Overlay 关闭时**：折叠所有已展开的 block
- 所有折叠操作加 200ms 延迟，确保 overlay 已完成新卡片的渲染

```typescript
interface UseAutoCollapseBlocksInput {
  enabled: boolean;
  currentCardRefUid: string | undefined;
  isLineByLineActive: boolean;
  childUidsList: string[];
  lineByLineCurrentChildIndex: number;
  lineByLineIsCardComplete: boolean;
  isOpen: boolean;
}

export default function useAutoCollapseBlocks({
  enabled,
  currentCardRefUid,
  isLineByLineActive,
  childUidsList,
  lineByLineCurrentChildIndex,
  lineByLineIsCardComplete,
  isOpen,
}: UseAutoCollapseBlocksInput) {
  const expandedBlockUidsRef = React.useRef<Set<string>>(new Set());
  const prevCardRefUidRef = React.useRef<string | undefined>();
  const prevChildIndexRef = React.useRef<number>(0);

  // 追踪已展开的 block
  React.useEffect(() => {
    if (!enabled || !isOpen || !currentCardRefUid) return;
    expandedBlockUidsRef.current.add(currentCardRefUid);
  }, [enabled, isOpen, currentCardRefUid]);

  // 卡片切换时折叠前一个卡片
  React.useEffect(() => {
    if (!enabled) return;
    const prevUid = prevCardRefUidRef.current;
    prevCardRefUidRef.current = currentCardRefUid;
    if (prevUid && prevUid !== currentCardRefUid) {
      setTimeout(() => collapseBlockOnPage(prevUid), 200);
    }
  }, [enabled, currentCardRefUid]);

  // LBL 模式：折叠之前的子 block
  React.useEffect(() => {
    if (!enabled || !isLineByLineActive) return;
    const prevIndex = prevChildIndexRef.current;
    prevChildIndexRef.current = lineByLineCurrentChildIndex;
    if (lineByLineCurrentChildIndex > prevIndex) {
      for (let i = prevIndex; i < lineByLineCurrentChildIndex; i++) {
        const uid = childUidsList[i];
        if (uid) {
          expandedBlockUidsRef.current.add(uid);
          setTimeout(() => collapseBlockOnPage(uid), 200);
        }
      }
    }
  }, [enabled, isLineByLineActive, lineByLineCurrentChildIndex, childUidsList]);

  // LBL 卡片完成时折叠父 block
  React.useEffect(() => {
    if (!enabled || !lineByLineIsCardComplete || !currentCardRefUid) return;
    setTimeout(() => collapseBlockOnPage(currentCardRefUid), 200);
  }, [enabled, lineByLineIsCardComplete, currentCardRefUid]);

  // Overlay 关闭时折叠所有已展开的 block
  React.useEffect(() => {
    if (!enabled) return;
    if (!isOpen && expandedBlockUidsRef.current.size > 0) {
      const uids = [...expandedBlockUidsRef.current];
      expandedBlockUidsRef.current.clear();
      setTimeout(() => {
        uids.forEach(uid => collapseBlockOnPage(uid));
      }, 300);
    }
  }, [enabled, isOpen]);
}
```

### Step 4: 集成到 PracticeOverlay

**文件: [PracticeOverlay.tsx](file:///Users/a123/Documents/chengxu%20project/roam-memo-main/src/components/overlay/PracticeOverlay.tsx)**

1. 从 `settings` 中解构 `autoCollapseBlocks`
2. 导入并调用 `useAutoCollapseBlocks` hook：

```typescript
useAutoCollapseBlocks({
  enabled: autoCollapseBlocks,
  currentCardRefUid,
  isLineByLineActive,
  childUidsList,
  lineByLineCurrentChildIndex,
  lineByLineIsCardComplete,
  isOpen,
});
```

### Step 5: LBL 模式 Overlay 内子 block 折叠增强

**文件: [LineByLineView.tsx](file:///Users/a123/Documents/chengxu%20project/roam-memo-main/src/components/overlay/LineByLineView.tsx)**

修改渲染逻辑，使之前的子 block 视觉上折叠（只显示文本，隐藏子 block 的 children）：
- 当前子 block：`showAnswers={true}`，正常展开
- 之前的子 block：`hideChildren={true}`，隐藏 children
- 这样用户可以聚焦当前子 block，同时仍能看到之前子 block 的文本概要

```tsx
{childUidsList.slice(0, lineByLineRevealedCount).map((uid, index) => {
  const isCurrentLine = index === lineByLineCurrentChildIndex;
  return (
    <LineByLineItem key={uid} $isCurrent={isCurrentLine} $isMastered={!!isMastered}>
      <CardBlock
        refUid={uid}
        showAnswers={true}
        setHasCloze={setHasCloze}
        breadcrumbs={[]}
        showBreadcrumbs={false}
        onRenderComplete={NOOP}
        hideChildren={!isCurrentLine}  // 非当前行隐藏 children
      />
    </LineByLineItem>
  );
})}
```

## 修改文件清单

| 文件 | 修改内容 |
|------|---------|
| `src/hooks/useSettings.ts` | 添加 `autoCollapseBlocks` 设置项 |
| `src/components/SettingsForm.tsx` | 添加 `autoCollapseBlocks` checkbox |
| `src/queries/settings.ts` | 添加 `autoCollapseBlocks` 的读写 |
| `src/utils/dom.ts` | 添加 `collapseBlockOnPage` 函数 |
| `src/hooks/useAutoCollapseBlocks.ts` | 新建 hook |
| `src/components/overlay/PracticeOverlay.tsx` | 集成 hook |
| `src/components/overlay/LineByLineView.tsx` | LBL 子 block 折叠增强 |

## 注意事项

1. **折叠时机**：所有折叠操作需加延迟（200-300ms），确保 overlay 已完成新卡片渲染，避免影响当前显示
2. **overlay 内 block 不受影响**：`collapseBlockOnPage` 通过过滤 `[role="dialog"]` 内的元素，确保只折叠 Roam 页面上的 block，不影响 overlay 内的渲染
3. **LBL 模式**：之前的子 block 在 overlay 中通过 `hideChildren={true}` 隐藏 children，而非真正折叠（避免影响 Roam 数据库状态）
4. **设置默认开启**：`autoCollapseBlocks` 默认为 `true`，用户可在 Settings 中关闭
