# Tasks

- [x] Task 1: 冗余代码与死代码识别 — 扫描 src/ 目录，识别未使用的导出函数、可内联的单用途函数、过小模块
  - [x] SubTask 1.1: 使用 grep 搜索 `subtractDays` 的所有引用，确认是否为死代码 — 生产代码零引用，仅测试文件使用（28处）
  - [x] SubTask 1.2: 使用 grep 搜索 `fromNow` 的所有引用，评估内联可行性 — 仅1处调用（customFromNow内部），可内联
  - [x] SubTask 1.3: 使用 grep 搜索 `createBlockOnPage` 的所有引用，评估内联可行性 — 仅1处调用（getOrCreateBlockOnPage内部），可内联
  - [x] SubTask 1.4: 使用 grep 搜索 `DAILYNOTE_DECK_KEY` 的所有引用，评估 constants.ts 合并可行性 — 2个文件使用，保留独立模块合理
  - [x] SubTask 1.5: 对比 `async.ts` 的 debounce 与 `useSettings.ts` 的 debounce 实现，分析功能差异 — 功能不同：通用防抖 vs React生命周期安全防抖

- [x] Task 2: 重复逻辑识别 — 识别代码库中重复实现的功能模式
  - [x] SubTask 2.1: 搜索所有 `JSON.parse(deckConfigs)` 出现位置，统计重复次数 — 6处（5个文件），回退值不一致
  - [x] SubTask 2.2: 搜索 Footer.tsx 中导航按钮的内联样式对象，统计重复次数 — 8组（16行）高度重复
  - [x] SubTask 2.3: 对比 AlgorithmSelector、InteractionSelector、TagSelector 的渲染模式 — 结构相似但内容差异大
  - [x] SubTask 2.4: 对比 Header.tsx 和 Footer.tsx 中的 SelectorItemWrapper 样式 — 共享::before高亮模式，布局策略不同
  - [x] SubTask 2.5: 对比 isSessionDue 和 isSessionMastered 中的日期归一化逻辑 — 归一化完全一致，仅判定条件和空值语义不同

- [x] Task 3: 模块耦合分析 — 分析组件/函数的职责和耦合程度
  - [x] SubTask 3.1: 统计 PracticeSessionContext 的 value 字段数量 — 16个字段（12必填+4可选），God Context
  - [x] SubTask 3.2: 统计 PracticeOverlay.tsx 的行数和职责数量 — 977行，6+职责
  - [x] SubTask 3.3: 统计 Footer.tsx 的行数和子组件数量 — 1121行，12个子组件
  - [x] SubTask 3.4: 分析 limitRemainingPracticeData 函数的复杂度 — 263行，多层嵌套循环
  - [x] SubTask 3.5: 分析 queries/data.ts 的职责混合情况 — 788行，混合数据查询和业务逻辑
  - [x] SubTask 3.6: 分析 App.tsx 的关注点数量 — 8个Hook，10个关注点

- [x] Task 4: 类型安全评估 — 识别 any 类型使用和缺失的类型注解
  - [x] SubTask 4.1: 搜索所有 `: any` 类型注解的出现位置 — 35处（11个文件）
  - [x] SubTask 4.2: 搜索所有无类型参数的公共函数 — 20个导出函数参数无类型（queries/目录）
  - [x] SubTask 4.3: 搜索所有 `as` 类型断言的使用 — 63处（42处as Type + 21处as any）

- [x] Task 5: 测试覆盖率评估 — 评估核心模块的测试覆盖情况
  - [x] SubTask 5.1: 列出所有测试文件及其覆盖的模块 — 10个测试文件
  - [x] SubTask 5.2: 识别缺少测试的核心业务逻辑函数 — 5/6核心函数无测试
  - [x] SubTask 5.3: 评估现有测试的质量和边界情况覆盖 — 约20%源文件有测试覆盖

- [x] Task 6: 生成优化建议优先级排序 — 综合所有发现，按影响程度和实施难度排序
  - [x] SubTask 6.1: 将发现分类为高/中/低优先级
  - [x] SubTask 6.2: 为每个优化建议评估实施难度和预期收益
  - [x] SubTask 6.3: 生成最终分析报告

# Task Dependencies
- Task 6 depends on Task 1, 2, 3, 4, 5
- Task 1-5 可并行执行
