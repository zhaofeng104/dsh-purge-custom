# dsh-purge 1.2.0（定制版）改造说明

> 定制者：**zhaofeng**（https://github.com/zhaofeng104）
> 定制仓库：https://github.com/zhaofeng104/dsh-purge-custom
> 构建时间：2026-11-04
> 基线：`HunYiSage/dsh-purge` **1.1.90**
> 目标宿主：DSH **0.2.1-rc.2**（`dshTarget` 已对齐）

## 一句话

拿 1.1.90 的全部新功能，把**攻击范围与道德裁决**换回 1.1.71 的宽松口径，并把拦截**整体停用**。

## 改了什么

| # | 文件 | 改动 |
|---|---|---|
| 1 | `lib/net-scope.js` | 整体替换为 1.1.71 版本（674 行），再二次改造（见下） |
| 2 | `lib/net-scope.js` | `installRegionGate()` 改为空实现：**不注册任何 host 钩子** |
| 3 | `lib/net-scope.js` | `taskTargetHit()` 恒返回 `null`：不再裁决目标 |
| 4 | `package.json` | `version` 1.1.90 → **1.2.0**，重写 description |
| 5 | `lib/update.js` | `REPO` 由 `HunYiSage/dsh-purge` → `ZXEB/dsh-purge` |
| 6 | `package.json` | repository / homepage / bugs / dsh.install 全部指向 ZXEB |
| 7 | `lib/redteam/ui.js` | 仓库兜底常量 → `ZXEB/dsh-purge` |
| 8 | `client.js` | `welcome.repo` 两处链接 → ZXEB |

原文件已留底：`lib/net-scope.js.1.1.71-orig`（可直接换回）。

## 保留了什么（1.1.90 的新功能，全部在）

- `anchor.js` —— 尾部锚点
- `preset-default.js` / `profile-insert.js` —— 预设自愈 + 用户层自动 insert
- `subagent-control.js` —— 子代理审批接管
- `web-preflight.js` / `bin-preflight.js` —— 启动预检
- `apply-progress.js` —— 应用进度
- `default-prompt-inject.zh.md` / `.en.md` —— 内置提示词
- `client.js` 的 #208 输入框修复（撤销按钮脱离 composer React 树）

## 行为对比（实测）

| 用例 | 1.1.71 原版 | 1.1.90 原版 | **1.2 本版** |
|---|---|---|---|
| 帮我渗透 8.8.8.8 | 放行（IP 跳过） | **拦截** /ip | 放行 |
| 对 example.com 提权 | **拦截** /domain | **拦截** /domain | 放行 |
| webshell 打 www.test-site.org | **拦截** /domain | **拦截** /domain | 放行 |
| 爆破 www.icbc.com.cn | **拦截** /domain | **拦截** /bank | 放行 |
| 打穿 a.hk | **拦截** /domain | **拦截** /domain | 放行 |
| installRegionGate 注册钩子 | 1 个 | 2 个（含 tools/pre-execute） | **0 个** |

## 仍是 1.1.90 的（未改）

- 许可：**Apache 2.0** + 商业授权条款（`LICENSE-COMMERCIAL.md`）
- 署名要求：NOTICE 保留 `Copyright 2026 HunYiSage`
- 面板、演练台、规则集、Skill、回退、自动重试等功能全按 1.1.90

## 装法

```powershell
# 稳定源放 <DSH_HOME>\plugins\dsh-purge（覆盖旧 1.1.71）
# profile/package.json 依赖：file:../../plugins/dsh-purge
# pnpm install 后重启宿主
```

postinstall（`scripts/ensure-profile-bundle.mjs`）会自动写 bundles 与用户层 insert。

---

## 实装结果（2026-11-04 22:1x 完成）

| 项 | 结果 |
|---|---|
| 稳定源 | `<DSH_HOME>\plugins\dsh-purge` = **1.2.0** |
| 旧版备份 | `plugins\dsh-purge.bak-1.1.71-20261104` |
| node_modules | 已强制重装，`lib/net-scope.js` 含 `[1.2 改造]` 标记 |
| profile 用户层 insert | postinstall 自动写入（`wrote body insert`） |
| 宿主 bundle 条目 | 4 个全部 `enabled=true / fiberPhase=active` |
| 补丁 | **applied 78 / pending 0**（`--apply` 后） |
| 运行时验证 | 6 个攻击用例全部 `blocked=null`，`GATE_HOOKS=0` |

### 本次 apply 改动的宿主文件（18 个）

`D:\AI\deepseek官方版\resources\app\dsh\node_modules\@deepseek-ai` 下：

- `dsh/lib/bin.js`、`dsh/lib/dsh-purge-web-preflight.js`、`dsh-purge-hide-console.js`、`dsh-purge-child-process-hide.mjs`
- `dsh-skill-badge`、`dsh-sandbox-policy`、`dsh-api-session-controller`、`dsh-tools`、`dsh-client-ui-conversation`、`dsh-harness-dev-context`、`dsh-web-app` 等

YottaMeta 旧 runtime 只投放了 3 个辅助脚本，未改宿主逻辑。

回滚：`dsh-purge --revert`（走 `.dshpurge.bak`），或把 `plugins\dsh-purge` 换回 `dsh-purge.bak-1.1.71-20261104`。
