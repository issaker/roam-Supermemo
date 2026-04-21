# 修复 Data Migration Phase 4 字段迁移逻辑

## 问题分析

### 核心问题：Phase 4 字段迁移逻辑存在两个关键缺陷

**缺陷 1：`intervalMultiplier` → `fixed_multiplier` 的重命名对 PROGRESSIVE 卡片是语义错误的**

当前 `FIELD_RENAME_MAP` 无条件将 `intervalMultiplier` 映射为 `fixed_multiplier`：

```typescript
const FIELD_RENAME_MAP: Record<string, string> = {
  // ...
  intervalMultiplier: 'fixed_multiplier',  // ← 对 PROGRESSIVE 卡片错误！
};
```

但在旧系统中，`intervalMultiplier` 在不同算法下有不同含义：
- **PROGRESSIVE 卡片**：`intervalMultiplier` 存储的是间隔天数（等价于新系统的 `progressive_interval`），`intervalMultiplierType:: Progressive` 标识这一点
- **FIXED_TIME 卡片**：`intervalMultiplier` 存储的是用户配置的乘数（等价于新系统的 `fixed_multiplier`）

用户数据示例：
```
旧数据（PROGRESSIVE 卡片）：
  progressiveRepetitions:: 2
  intervalMultiplierType:: Progressive
  intervalMultiplier:: 6          ← 这是 progressive_interval，不是 fixed_multiplier！

正确迁移后应为：
  progressive_repetitions:: 2
  progressive_interval:: 6        ← 不是 fixed_multiplier:: 6
```

**缺陷 2：Phase 4 逐字段独立处理，无法做上下文感知的决策**

当前 Phase 4 的循环逐字段处理，无法在处理 `intervalMultiplier` 时参考同 session 的 `intervalMultiplierType` 或 `algorithm` 字段值：

```typescript
for (const field of sessionBlock.children) {
    const [key, value] = parseConfigString(field.string);
    if (FIELD_RENAME_MAP[key]) {
        // 无条件重命名，无法参考其他字段
        await updateBlock({ uid: field.uid, string: `${FIELD_RENAME_MAP[key]}:: ${value}` });
    }
}
```

### 次要问题

1. **新字段名已存在时会产生重复**：如果 session block 中同时存在 `progressiveRepetitions:: 2` 和 `progressive_repetitions:: 1`，重命名会产生两个 `progressive_repetitions` 字段
2. **PROGRESSIVE 卡片缺少 `progressive_interval` 时不会补算**：迁移后若 `progressive_interval` 缺失，运行时 `progressive_repetitions` 虽存在但间隔信息丢失，导致卡片从零开始
3. **Phase 4 统计和错误未报告给用户**：Phase 4 的 renamed/deleted 计数仅通过 `debugLog`（默认关闭）输出，错误也不计入 `totalErrors`
4. **Scan 步骤不检测旧字段名**：扫描仅查找 `reviewMode` 字段，若所有卡片已有 `algorithm` + `interaction`，扫描结果显示 0 卡片需要迁移，用户可能不会点击迁移按钮

---

## 实施步骤

### Step 1：重构 Phase 4 为"先收集、后处理"的两阶段模式

将 Phase 4 的逐字段处理改为按 session block 整体处理：

1. **收集阶段**：遍历 session block 的所有子字段，收集到 `Map<string, {uid, key, value}[]>` 中
2. **决策阶段**：基于收集到的完整字段信息，决定每个字段的操作（重命名/删除/跳过/新建）

```typescript
// 伪代码
for (const sessionBlock of cardChild.children) {
    // 收集所有字段
    const fieldsByUid: {uid: string, key: string, value: string}[] = [];
    const fieldKeys = new Set<string>();

    for (const field of sessionBlock.children) {
        const [key, value] = parseConfigString(field.string);
        fieldsByUid.push({ uid: field.uid, key, value });
        fieldKeys.add(key);
    }

    // 确定算法类型（用于 intervalMultiplier 的决策）
    const algorithm = fieldsByUid.find(f => f.key === 'algorithm')?.value;
    const multiplierType = fieldsByUid.find(f => f.key === 'intervalMultiplierType')?.value;

    // 处理每个字段
    for (const field of fieldsByUid) {
        // ... 基于完整上下文做决策
    }
}
```

### Step 2：修复 `intervalMultiplier` 的迁移逻辑

根据 `intervalMultiplierType` 和 `algorithm` 决定 `intervalMultiplier` 的目标字段名：

```typescript
// 决定 intervalMultiplier 的目标字段名
function resolveIntervalMultiplierTarget(
    multiplierType: string | undefined,
    algorithm: string | undefined
): string | undefined {
    // intervalMultiplierType 明确指定为 Progressive
    if (multiplierType === 'Progressive') return 'progressive_interval';
    // intervalMultiplierType 明确指定为 Fixed 类型
    if (multiplierType === 'Fixed' || multiplierType === 'FixedDays' || multiplierType === 'FixedWeeks') return 'fixed_multiplier';
    // 无 intervalMultiplierType，根据 algorithm 推断
    if (algorithm === 'PROGRESSIVE' || algorithm === 'FIXED_PROGRESSIVE') return 'progressive_interval';
    if (algorithm === 'FIXED_TIME' || algorithm === 'FIXED_DAYS' || algorithm === 'FIXED_WEEKS' || algorithm === 'FIXED_MONTHS' || algorithm === 'FIXED_YEARS') return 'fixed_multiplier';
    // 默认：fixed_multiplier（保持向后兼容）
    return 'fixed_multiplier';
}
```

### Step 3：处理新字段名已存在的情况

在重命名旧字段前，检查目标字段名是否已存在于同一 session block 中：

```typescript
// 如果目标字段名已存在，删除旧字段块而非重命名
if (fieldKeys.has(newKeyName)) {
    await window.roamAlphaAPI.deleteBlock({ block: { uid: field.uid } });
    phase4Deleted++;
} else {
    await window.roamAlphaAPI.updateBlock({
        block: { uid: field.uid, string: `${newKeyName}:: ${field.value}` },
    });
    phase4Renamed++;
}
```

### Step 4：为 PROGRESSIVE 卡片补算 `progressive_interval`

在重命名 `progressiveRepetitions` → `progressive_repetitions` 后，如果 session block 中没有 `progressive_interval`（也没有 `intervalMultiplier` 可转换），则根据 `progressive_repetitions` 的值计算：

```typescript
// 重命名完成后，检查是否需要补算 progressive_interval
if (algorithm === 'PROGRESSIVE' && !fieldKeys.has('progressive_interval') && !fieldKeys.has('progressiveInterval')) {
    const progReps = fieldsByUid.find(f => f.key === 'progressive_repetitions')?.value
        ?? fieldsByUid.find(f => f.key === 'progressiveRepetitions')?.value;
    if (progReps !== undefined) {
        const interval = progressiveInterval(Number(progReps));
        await window.roamAlphaAPI.createBlock({
            location: { 'parent-uid': sessionBlock.uid, order: -1 },
            block: { string: `progressive_interval:: ${interval}`, open: false },
        });
        phase4Created++;
    }
}
```

注意：需要从 `FIELD_RENAME_MAP` 中移除 `intervalMultiplier` 条目，改为在决策阶段动态决定目标字段名。

### Step 5：将 Phase 4 统计和错误纳入用户可见的输出

1. 将 Phase 4 的 renamed/deleted/created 计数加入进度显示
2. 将 Phase 4 错误计入 `totalErrors` 和 `errMsgs`
3. 在迁移完成后的摘要中显示 Phase 4 统计

```typescript
// 修改 totalErrors 计算
const totalErrors = errors + phase3Errors + phase4Errors + phase6Errors;

// 在进度显示中加入 Phase 4 信息
setProgress({
    total,
    migrated,
    skipped,
    phase: `Phase 4: Renamed ${phase4Renamed}, deleted ${phase4Deleted}, created ${phase4Created} fields`,
});
```

### Step 6：增强 Scan 步骤，检测旧字段名

在 `runScan` 中增加对旧字段名的检测，让用户知道即使没有 `reviewMode` 需要转换，仍有字段需要重命名/删除：

```typescript
// 扫描旧字段名
const LEGACY_FIELD_NAMES = ['progressiveRepetitions', 'progressiveInterval', 'intervalMultiplier', 'intervalMultiplierType', 'repetitions', 'interval', 'eFactor', 'grade', 'lineByLineReview'];

let cardsWithLegacyFields = 0;
for (const cardUid of cardUids) {
    // ... 检查 session blocks 中是否有旧字段名
    if (hasLegacyFieldNames(rawCardChildren, LEGACY_FIELD_NAMES)) {
        cardsWithLegacyFields++;
    }
}
```

在扫描结果中显示：
```
Cards needing reviewMode conversion: 0
Cards with legacy field names: 5
Cards already up-to-date: 10
```

---

## 修改文件清单

| 文件 | 变更内容 |
|------|----------|
| `src/components/MigrateLegacyDataPanel.tsx` | 重构 Phase 4 为两阶段模式；修复 `intervalMultiplier` 迁移逻辑；处理新字段名重复；补算 `progressive_interval`；Phase 4 统计纳入用户输出；增强 Scan 检测旧字段名 |

## 风险评估

- **低风险**：Phase 4 重构为两阶段模式，逻辑更清晰，不影响其他 Phase
- **低风险**：`intervalMultiplier` 迁移逻辑修复，仅影响有此字段的旧数据卡片
- **低风险**：`progressive_interval` 补算仅在字段缺失时触发，不会覆盖已有值
- **需注意**：新字段名重复处理（删除旧字段而非重命名）可能导致数据丢失——但这是正确行为，因为新字段值更准确
