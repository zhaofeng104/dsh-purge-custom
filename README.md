<p align="center">
  <img src="docs/banner.svg" alt="dsh-purge" width="720">
</p>

<h1 align="center">dsh-purge 1.2.0 定制版 <sub>by zhaofeng</sub></h1>

<p align="center">
  <strong>DeepSeek Harness 破甲 / 红队评测插件 · <a href="https://github.com/zhaofeng104">zhaofeng</a> 定制构建</strong><br>
  <em>基于上游 <a href="https://github.com/HunYiSage/dsh-purge">HunYiSage/dsh-purge</a> 1.1.90（经 <a href="https://github.com/ZXEB/dsh-purge">ZXEB/dsh-purge</a> 镜像）改造</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.2.0-1a73e8?style=flat" alt="version">
  <img src="https://img.shields.io/badge/license-Apache--2.0-65a30d?style=flat" alt="Apache-2.0">
  <img src="https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=fff" alt="Node.js">
</p>
<p align="center">
  <strong>🔧 本构建由 <a href="https://github.com/zhaofeng104">@zhaofeng</a> 定制</strong><br>
  <sub>1.2.0-custom · 非上游官方发布 · 修改内容见下文第二节</sub>
</p>

> **这是 [@zhaofeng](https://github.com/zhaofeng104) 的个人定制构建，不是上游官方版。**
> 它把 1.1.90 的攻击范围与目标裁决逻辑换回 1.1.71 的宽松口径，并停用了区域与目标拦截。
> 想装上游原版，请去 [HunYiSage/dsh-purge](https://github.com/HunYiSage/dsh-purge) 或 [ZXEB/dsh-purge](https://github.com/ZXEB/dsh-purge)。
> 上游三份 README（中/英/日）原样保留在 [`docs/upstream/`](docs/upstream/)。

---

## 一、安装

**前提**：DSH Desktop（或 `dsh web`）已启动过一次让 profile 初始化，且**已完整退出**（托盘 → 退出，不是关窗口）。

### 方式 A：一行命令（需要 `dsh` 在 PATH）

```powershell
# 桌面宿主
dsh plugin --profile desktop add https://codeload.github.com/zhaofeng104/dsh-purge-custom/tar.gz/refs/heads/main

# Web 宿主
dsh plugin --profile web add https://codeload.github.com/zhaofeng104/dsh-purge-custom/tar.gz/refs/heads/main
```

`dsh` 不在 PATH 时用桌面版自带的：`<安装目录>\resources\runtime\cli\bin\dsh.cmd`。

装完 profile 的 `package.json` 里会多出 `dependencies.dsh-purge` 与 `dsh.profile.bundles` 里的 `dsh-purge`；再补两段 `cordis.patch.yml` 的 `- insert:`（见方式 C 第 2 步）。

### 方式 B：本地目录（离线可用）

```powershell
# 目录里必须能直接看到 package.json
dsh plugin --profile desktop add D:\path\to\dsh-purge-custom
```

### 方式 C：手动（CLI 装不上时兜底）

1. 把本仓库整个目录放到 `<DSH_HOME>\plugins\dsh-purge`（**目录名必须是 `dsh-purge`**）。
2. profile 的 `package.json` 追加两处：
   ```json
   "dependencies": { "dsh-purge": "file:../../plugins/dsh-purge" },
   "dsh": { "profile": { "bundles": [ "...", "dsh-purge" ] } }
   ```
   `cordis.patch.yml` 末尾追加：
   ```yaml
   - insert:
       - id: dsh-purge
         name: dsh-purge
         inject: [systemPrompt, tools]
         config:
           enabled: true
           stripMnemon: true
           capabilityProtocol: true
           hooksDenyBypass: true
   ```
   > 必须是 `- insert:`。写成 `- id:` 是"改已存在条目"，树里没有这个 id 就静默跳过，插件永远不加载。
3. 复制到 `<profile>\node_modules\dsh-purge`（手动路径下 pnpm 不参与）。

### 装完三步（不做等于没装）

1. **完整退出并重开宿主**（插件只在启动时读一次）。
2. 点会话标题旁的 **dsh-purge** → **清洗** → **应用**。
3. 模式下拉里会出现 **无限制模式**（预设随包注册）。

---

## 二、和上游 1.1.90 / 1.1.71 的差别

| # | 文件 | 改动 |
|---|---|---|
| 1 | `lib/net-scope.js` | 整体替换为 1.1.71 版本（674 行），再二次改造 |
| 2 | `lib/net-scope.js` | `installRegionGate()` 改为空实现：**不注册任何 host 钩子** |
| 3 | `lib/net-scope.js` | `taskTargetHit()` 恒返回 `null`：不再裁决目标 |
| 4 | `package.json` | `version` 1.1.90 → **1.2.0**，重写 description |
| 5 | `lib/update.js` | `REPO` → 本仓库；`STABLE_REF` `master` → `main` |
| 6 | `package.json` | `repository` / `homepage` / `bugs` / `dsh.install` 全部指向本仓库 |
| 7 | `lib/redteam/ui.js` | 仓库兜底常量 → 本仓库 |
| 8 | `client.js` | `welcome.repo` 两处链接 → 本仓库 |

原 1.1.71 的 `installRegionGate()` 唯一原件留在 `lib/net-scope.js.1.1.71-orig`，`lib/net-scope.js` 里另有一处注释指向它 —— 想恢复「域名/银行拦截审查」这条路可以直接换回。

### 1.2.0 之后补的修复（相对本仓库初版）

| # | 改动 | 不改会怎样 |
|---|---|---|
| A | `package.json` 的 `exports` 增加 `"./presets-plugin"` | 抛 `ERR_PACKAGE_PATH_NOT_EXPORTED`，「无限制模式」预设静默不加载 |
| B | `presets/redteam/agent.cordis.yml` 删掉 `list-agents` 挂载行 | DSH 0.2.2 起该子路径已并入主入口，留着整条 preset 报 `never started` |
| C | `package.json` 的 `files` 增加 `"skills"` | 上游白名单漏了，`npm pack` 后红队 27 个技能会缺 |
| D | `presets/unrestricted/` 无限制模式预设随包 | 模式下拉里没有第六张卡片 |

### 保留了什么（1.1.90 的全部新功能）

`anchor.js`（尾部锚点）、`preset-default.js` / `profile-insert.js`（预设自愈 + 用户层自动 insert）、`subagent-control.js`（子代理审批接管）、`web-preflight.js` / `bin-preflight.js`（启动预检）、`apply-progress.js`（应用进度）、内置中英提示词、以及 `client.js` 的 #208 输入框修复（撤销按钮脱离 composer 的 React 子树）。

### 行为对比（实测）

| 用例 | 1.1.71 | 1.1.90 | **本版** |
|---|---|---|---|
| 指定 IP 的渗透动作 | 放行 | **拦截** | 放行 |
| 对域名做提权 | **拦截** | **拦截** | 放行 |
| webshell 落域名 | **拦截** | **拦截** | 放行 |
| 对银行域名爆破 | **拦截** | **拦截** | 放行 |
| `installRegionGate` 注册钩子 | 1 个 | 2 个 | **0 个** |

---

## 三、目录结构

| 路径 | 说明 |
|---|---|
| `bin/dsh-purge.js` | CLI 入口（`--status / --apply / --revert / --uninstall / --edit`） |
| `lib/patches.js` | 86 条补丁的数据表（从 `core.js` 拆出，纯数据） |
| `lib/core.js` | 补丁引擎、路径探测、shim 注入、备份与还原 |
| `lib/net-scope.js` | 区域/目标裁决（本版已停用） |
| `lib/redteam/` | 演练台：事实库、技能登记、HTTP 桥 |
| `lib/presets*.js` | 「无限制模式」预设的注册与落盘 |
| `client.js` | 右侧栏前端产物（构建自 `scripts/build-client.mjs`） |
| `cordis.patch.yml` | bundle patch：注册本体与三个演练台子模块 |
| `presets/redteam/` | 红队预设（预置为「已停用裁决」形态） |
| `presets/unrestricted/` | 无限制模式预设 |
| `skills/redteam/` | 27 个随包技能（侦察、扫描、隧道、口令、横向、报告等） |
| `docs/` | banner、授权声明页、上游许可与披露文件、上游 README 原件 |
| `docs/upstream/` | 上游中/英/日三份 README 原样存档 |

运行时（`<DSH_HOME>` 下）：`prompt-inject.md`（用户文件）、`rules/`、`skills/`、`redteam/`（演练台事实库与工具配置）、`dsh-purge/`（插件状态）。

---

## 四、兼容性

| 项 | 说明 |
|---|---|
| 声明的 `dshTarget` | `0.2.1-rc.2`（`dshTargets` 另列 `0.2.1-rc.5`） |
| 宿主预检 | 本包 peer 只有 `@deepseek-ai/cordis`，不在宿主兼容性预检的检查范围内；`0.1.5 / 0.2.1-rc.2 / 0.2.2-rc.1 / 0.3.0` 实测均不被跳过 |
| Node.js | ≥ 18 |
| 实测环境 | Windows + DSH Desktop（宿主 0.2.2-rc.1），补丁 71 applied / 13 na / 1 missing_file |

---

## 五、卸载与回滚

```powershell
dsh plugin --profile desktop remove dsh-purge
# 或面板「清洗 → 卸载」
```

先「还原」（`/purge revert` 或面板按钮）再卸载，宿主文件会被 `.dshpurge.bak` 备份覆盖回去。`prompt-inject.md`、`rules/`、`skills/` 是你自己的文件，卸载不动。

---

## 六、声明、署名与许可

**本定制署名**：本仓库（`dsh-purge-custom`）由 **[@zhaofeng](https://github.com/zhaofeng104)** 定制维护，基于 `HunYiSage/dsh-purge` 1.1.90 改造，版本号 `1.2.0`。定制者与上游作者、镜像维护者均无从属关系，也不代表上游立场；上游的任何商业授权不因本仓库的改编而转移给本仓库或其使用者。

**来源与署名（继承上游要求）**：本项目使用上游代码与提示词，原始来源为 **`YuJunZhiXue/dsh-purge`（原作者：小杨）**，本版基线为 **`HunYiSage/dsh-purge` 1.1.90**，经 **`ZXEB/dsh-purge`** 镜像取得。

**本仓库改动声明**（Apache-2.0 §4(b)）：本仓库对上游文件的修改已逐项列在第二节；`NOTICE` 保留上游版权行；`docs/upstream/` 保存上游 README 原件。

**许可**：[Apache License 2.0](LICENSE)。商业授权条款见 [LICENSE-COMMERCIAL.md](LICENSE-COMMERCIAL.md)（上游条款，本仓库不代理任何商业授权）。

**用途边界**：本插件只作用于**你自己机器上已安装的官方 DeepSeek Harness**，不扫描、不探测、不向任何公网主机发送攻击流量。演练台与随包技能用于自管主机、离线靶标或**有书面授权**的演练；对无授权目标、生产环境请勿使用。使用者自行承担全部责任。

**与 DeepSeek 的关系**：本项目是独立的第三方插件，与 DeepSeek 及其关联方无雇佣、商业、授权或背书关系。

---

## 七、更新日志

完整历史见 [release-notes.md](release-notes.md)、本版改造细节见 [CHANGELOG-1.2.md](CHANGELOG-1.2.md)。

> `release-notes.md` 中 1.1.16–1.1.46 共 29 个版本段的中文条目在上游包内即为编码损坏（UTF-8 被按 GBK 解析），本仓库未猜测原文，将损坏块替换为指向同段英文条目的说明；其余段落保持上游原样。

<!-- Customized-by: zhaofeng (https://github.com/zhaofeng104) | build: 1.2.0-custom | based-on: HunYiSage/dsh-purge 1.1.90 -->
