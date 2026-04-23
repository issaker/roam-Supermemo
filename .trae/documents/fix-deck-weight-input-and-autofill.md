# Bug 修复计划 — 权重输入与 Daily Review Limit 自动填充

## Bug 1: 牌组权重无法调节 + 滑块遮挡文字

**根因分析**:
- `Blueprint.Slider` 放在 `Blueprint.MenuItem` 的 `text` 属性内部，Slider 的拖拽事件被 MenuItem 的点击事件拦截，导致无法拖动
- Slider 占据 80px 宽度 + 百分比文字，在 MenuItem 狭窄空间内遮挡 "Deck Weight" 标签

**修复方案**:
- 移除 `Blueprint.Slider`，替换为 `Blueprint.InputGroup`（Blueprint 的数字输入组件），与项目中其他数字输入风格一致
- 输入框宽度紧凑（约 50px），右侧显示 `%` 后缀
- 输入值 0-100 范围校验

**修改文件**: `src/components/overlay/Header.tsx`

将 Slider 替换为：
```tsx
<Blueprint.InputGroup
  type="number"
  min={0}
  max={100}
  value={tagDeckWeight}
  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Math.min(100, Math.max(0, Number(e.target.value) || 0));
    setDeckWeight(text, value, tagsList);
  }}
  rightElement={<span className="text-xs" style={{ lineHeight: '30px', paddingRight: '8px' }}>%</span>}
  style={{ width: '60px' }}
  small
/>
```

---

## Bug 2: Daily Review Limit 输入框弹出自动填充

**根因分析**:
- `<input type="number">` 在浏览器中会触发自动填充（autocomplete）行为，浏览器可能将其识别为地址、电话等字段
- 其他数字输入框（如 "Reinsert Forgot Cards"）同样使用 `<input type="number">`，但它们的 label 文字不触发浏览器的自动填充启发式规则
- "Daily Review Limit" 中的 "Daily" 可能被浏览器识别为与个人信息相关的字段

**修复方案**:
- 为 Daily Review Limit 的 `<input>` 添加 `autoComplete="off"` 属性，禁止浏览器自动填充
- 同时检查其他所有 `<input type="number">` 字段，统一添加 `autoComplete="off"` 以保持一致性

**修改文件**: `src/components/SettingsForm.tsx`

所有 `<input type="number">` 添加 `autoComplete="off"` 属性。
