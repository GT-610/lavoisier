# Lavoisier · 化学模拟实验室

一个运行在浏览器里的 2D 高自由度化学模拟沙盒。你可以在多个「实验台」上自由摆放烧杯、
试管、酒精灯等仪器，向其中加入试剂，然后观察基于规则引擎驱动的化学反应：变色、气泡、
沉淀、放热乃至爆炸。

> 所有模拟都在前端完成 —— 没有后端、没有物理流体求解器，只有一个宏观状态机加区域检测。

## 技术栈

| 领域 | 选型 |
| --- | --- |
| 运行时 / 包管理 | [Bun](https://bun.sh) |
| 构建 | [Vite](https://vite.dev) + TypeScript |
| 前端框架 | React |
| 状态管理 | [Zustand](https://zustand.docs.pmnd.rs)（按 workspaceId 隔离的多实例 store） |
| 渲染 | HTML5 Canvas 2D + `requestAnimationFrame` |
| 样式 | Tailwind CSS v4 |
| 部署 | Cloudflare Pages（Wrangler） |

## 开发

```bash
bun install       # 安装依赖
bun run dev       # 启动开发服务器
bun run build     # 类型检查 + 生产构建，产物位于 dist/
bun run lint      # oxlint
bun run test      # 运行单元测试（166 个用例）
bun run check     # 类型检查 + lint + 测试，提交前跑这个
```

## 测试

测试以 Vitest 运行，覆盖全部非组件逻辑。测试文件与被测代码同目录（`*.test.ts`），
使用 `vitest.config.ts` 中独立于 `vite.config.ts` 的配置——测试不需要 React 与
Tailwind 插件，独立配置启动更快，也避免构建工具链的改动波及测试。

| 套件 | 覆盖内容 |
| --- | --- |
| `src/engine/reactionEngine.test.ts` | 规则匹配与优先级、限量试剂消耗、产物生成、催化剂不被消耗、指示剂不被消耗、温度积分与沸腾钳制、加热/搅拌/催化剂条件门控、爆炸、日志冷却、多容器隔离 |
| `src/data/catalogue.test.ts` | 试剂与仪器目录完整性、id 唯一性、规则表无失效引用，以及**可达性审计**（不存在无法被消耗的货架试剂、不存在无法被生成的产物） |
| `src/store/labStore.test.ts` | 工作区增删改与复制、跨工作区隔离、日志上限与去重、容器容量钳制、`contentsRevision` 契约、导入导出往返与恶意文件消毒 |
| `src/interaction/hitTest.test.ts` | 画布坐标换算、仪器轮廓命中（含试管圆底/锥形瓶颈等非矩形剪影）、旋转手柄、吸取最上层仪器 |
| `src/utils/math.test.ts` | 颜色解析与混合、旋转点与旋转包围盒、矩形相交、`cx`/`uid` |

> 可达性审计与温度模型这两组断言是回归护栏：开发期间真实出现过
> 「货架上有试剂永远无法反应」和「火焰温度上限低于热分解阈值，导致相关规则
> 永远无法触发」两个缺陷，两者在运行时都不报错，只表现为「点了没反应」。

## 部署到 Cloudflare Pages

```bash
bun run deploy  # 构建并通过 wrangler pages deploy dist 上传
```

项目内不含顶层 `404.html`，因此 Cloudflare Pages 会启用默认的 SPA 回退行为，
任意路径都会回落到 `index.html`。

## 目录结构

```
src/
├─ components/     # UI 组件（工作区标签栏、仪器库/试剂库、检视器、实验记录…）
├─ data/           # 试剂、仪器、反应规则等静态定义
├─ engine/         # 反应引擎（区域检测、规则匹配）与粒子系统
├─ interaction/    # 拖拽载荷与画布命中检测
├─ render/         # Canvas 场景合成与仪器绘制
├─ store/          # Zustand 多工作区 store 与作用域化 selector
├─ types/          # 全局类型定义
└─ utils/          # 通用工具函数（色彩混合、几何、id）
```

### 模拟模型

引擎采用「宏观状态机 + 区域检测」，不做流体求解：

1. 每帧对照 store 的 `contentsRevision` 同步一份容器镜像（仅在**用户操作**后重建）；
2. 几何检测哪些容器位于点燃的酒精灯火焰柱内、哪些被玻璃棒接触；
3. 积分温度（加热、向环境冷却、反应焓变），有水时钳制在沸点、蒸干后继续升温；
4. 取出优先级最高、反应物齐备且条件满足的规则，按 `rate × 温度 × 搅拌` 推进；
5. 施加效果：变色、透明度、气泡、沉淀、辉光、爆炸。

引擎在运行期间独占数值，按约 120 ms 的节奏通过单次 `commitSimulation` 写回 React，
因此画布以刷新率渲染而组件树每秒只重渲染约 10 次。

## 许可

[Apache-2.0](./LICENSE)
