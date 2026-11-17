import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import * as core from "./core.js";
import * as hostctl from "./host.js";
import * as rules from "./rules.js";
import * as updater from "./update.js";
import { clearDrillGrant } from "./drill-grant.js";
import { clearOwnedSelectedDefault, removeStaleAgentPresetDir } from "./preset-default.js";

export function wasApplied(state) {
  if (!state) return false;
  if (state.has_backup) return true;
  if (Number(state.patches_applied) > 0) return true;
  return [state.shim_cmd, state.shim_ps1, state.shim_bin].includes("patched");
}

export function shouldDeletePluginTree(dir) {
  if (!dir) return false;
  let real;
  try {
    real = fs.realpathSync(dir);
  } catch {
    /* realpath 失败 = 认不出这棵树到底在哪。以前回退成 path.resolve 继续往下判，
       等于在"目标不明确"的前提下允许递归删除；改成直接拒绝。 */
    return false;
  }
  const n = real.replace(/[/\\]+/g, "/").toLowerCase();
  // npm link / file: 安装的 realpath 会指到用户源码目录；只认安装树路径，
  // 不按末段名字猜，避免卸载时把源码仓库整棵删掉。
  //
  // 必须是「路径段精确到结尾」，不能用 includes 子串：includes("/node_modules/dsh-purge")
  // 会把 node_modules/dsh-purge-custom、node_modules/dsh-purge-src 一并判成可删除，
  // 而那些正是别人 fork 的源码目录名。pnpm 的 .pnpm/dsh-purge@x/node_modules/dsh-purge
  // 同样以该后缀结尾，因此 endsWith 不影响正常安装形态。
  return n.endsWith("/node_modules/dsh-purge");
}

function isPurgeBundleItem(item) {
  if (typeof item === "string") return item === "dsh-purge" || item.startsWith("dsh-purge@");
  const id = item && (item.id || item.name);
  return id === "dsh-purge";
}

function stripBundleList(list) {
  if (!Array.isArray(list)) return { list, changed: false };
  const next = list.filter((item) => !isPurgeBundleItem(item));
  return { list: next, changed: next.length !== list.length };
}

export function stripPluginFromPackage(pkg) {
  if (!pkg || typeof pkg !== "object") return false;
  let changed = false;
  for (const key of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    if (pkg[key] && Object.prototype.hasOwnProperty.call(pkg[key], "dsh-purge")) {
      delete pkg[key]["dsh-purge"];
      changed = true;
    }
  }
  for (const key of ["bundles", "plugins"]) {
    const top = stripBundleList(pkg[key]);
    if (top.changed) {
      pkg[key] = top.list;
      changed = true;
    }
    const nested = pkg.dsh && pkg.dsh.profile ? pkg.dsh.profile[key] : null;
    const nest = stripBundleList(nested);
    if (nest.changed) {
      pkg.dsh.profile[key] = nest.list;
      changed = true;
    }
  }
  return changed;
}

function readJson(fp) {
  try {
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(fp, value) {
  core.atomicWriteSync(fp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function pkgMentionsPurge(pkg) {
  if (!pkg) return false;
  if (pkg.dependencies?.["dsh-purge"] || pkg.devDependencies?.["dsh-purge"]) return true;
  for (const key of ["bundles", "plugins"]) {
    if (Array.isArray(pkg[key]) && pkg[key].some(isPurgeBundleItem)) return true;
    const nested = pkg.dsh && pkg.dsh.profile ? pkg.dsh.profile[key] : null;
    if (Array.isArray(nested) && nested.some(isPurgeBundleItem)) return true;
  }
  return false;
}

export function listInstalledProfiles(dshHome = core.findDshHome()) {
  const root = path.join(dshHome, "profiles");
  if (!fs.existsSync(root)) return [];
  let names = [];
  try {
    names = fs.readdirSync(root);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    const dir = path.join(root, name);
    const pkgPath = path.join(dir, "package.json");
    const pkg = readJson(pkgPath);
    const nm = path.join(dir, "node_modules", "dsh-purge");
    if (!pkgMentionsPurge(pkg) && !fs.existsSync(nm)) continue;
    const spec = pkg?.dependencies?.["dsh-purge"] || pkg?.devDependencies?.["dsh-purge"] || "";
    out.push({ name, dir, spec: String(spec || ""), pkgPath, hasModule: fs.existsSync(nm) });
  }
  return out;
}

async function unlinkIfExists(fp) {
  try {
    await fsp.unlink(fp);
    return true;
  } catch (e) {
    if (e && e.code === "ENOENT") return false;
    throw e;
  }
}

async function rmIfExists(fp) {
  try {
    await fsp.rm(fp, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

async function removeOverride(dshHome) {
  const fp = core.findOverrideFile(dshHome);
  const ok = await unlinkIfExists(fp);
  return { path: fp, removed: ok };
}

async function resetRules(dshHome) {
  const reset = await rules.resetToOriginal(dshHome);
  const dir = rules.rulesDir(dshHome);
  const removedDir = await rmIfExists(dir);
  return { ...reset, rules_dir: dir, rules_dir_removed: removedDir };
}

function collectCleanupDirs(profiles, dshHome) {
  const seen = new Set();
  const cleanup = [];
  /* 记一条待删目录。
     关键：**删目录时不能把链接解析成目标**。以前这里统一 realpath 后入列，
     于是 $DSH_HOME\dsh-purge 若是 junction，列表里存的是它指向的外部真实目录，
     卸载助手照单递归删除 —— 删掉的是外部目标，链接本身反而留着。
     现在按 lstat 判断：是链接就记链接自身路径（删除时 removeTreeNoFollow 只 unlink 链接），
     真目录才按路径记录（仍做一次 realpath 仅用于去重，不改变删除目标）。 */
  const remember = (dir) => {
    if (!dir) return;
    let linkPath = path.resolve(dir);
    let isLink = false;
    try {
      isLink = fs.lstatSync(linkPath).isSymbolicLink();
    } catch {
      /* 不存在：无需清理 */
      return;
    }
    let key = linkPath.toLowerCase();
    if (!isLink) {
      try {
        key = fs.realpathSync(linkPath).toLowerCase();
      } catch {
        /* realpath 失败：用原路径做 key，删除目标仍是原路径 */
      }
    }
    if (seen.has(key)) return;
    seen.add(key);
    cleanup.push(linkPath);
  };

  for (const p of profiles) {
    const nm = path.join(p.dir, "node_modules", "dsh-purge");
    if (!fs.existsSync(nm)) continue;
    let isLink = false;
    try {
      isLink = fs.lstatSync(nm).isSymbolicLink();
    } catch {
      continue;
    }
    if (isLink) {
      /* link / file: 安装：node_modules/dsh-purge 是指向源码的链接。
         只删链接本身，源码树一律不动（shouldDeletePluginTree 会因 realpath
         指向源码目录而拒绝；这里再显式保证不把 realpath 放进列表）。 */
      remember(nm);
      continue;
    }
    let real;
    try {
      real = fs.realpathSync(nm);
    } catch {
      real = path.resolve(nm);
    }
    if (shouldDeletePluginTree(real)) remember(nm);
  }

  const dataDir = path.join(dshHome, "dsh-purge");
  remember(dataDir);

  const root = updater.pluginRoot();
  /* 只有真实安装在 node_modules 下的树才整棵删；若 pluginRoot 解析到源码目录
     （npm link / file: 情形），shouldDeletePluginTree 会返回 false，跳过。 */
  let rootIsLink = false;
  try {
    rootIsLink = fs.lstatSync(path.resolve(root)).isSymbolicLink();
  } catch {
    /* 不存在则无需清理 */
  }
  if (rootIsLink) remember(root);
  else if (shouldDeletePluginTree(root)) remember(root);

  return cleanup;
}

function unregisterProfiles(profiles) {
  const stripped = [];
  const errors = [];
  for (const p of profiles) {
    try {
      const pkg = readJson(p.pkgPath) || {};
      if (stripPluginFromPackage(pkg)) {
        writeJson(p.pkgPath, pkg);
        stripped.push(p.name);
      }
    } catch (e) {
      errors.push({ profile: p.name, error: String(e && e.message ? e.message : e) });
    }
  }
  return { stripped, errors };
}

export async function uninstallPurge(options = {}) {
  const onStage = typeof options.onStage === "function" ? options.onStage : () => {};
  onStage("locate");
  const state = await core.gatherState();
  const applied = wasApplied(state);
  const dshHome = state.dsh_home || core.findDshHome();
  const report = {
    ok: true,
    applied,
    reverted: false,
    needRestart: true,
    patches: null,
    shim: null,
    flash: null,
    override: null,
    rules: null,
    profiles: [],
    cleanup: [],
    errors: [],
  };

  try {
    onStage("revert");
    if (state.ai_base) {
      report.patches = await core.revertAll(state.ai_base);
      if (applied) report.reverted = true;
    }
  } catch (e) {
    report.errors.push(`revert patches: ${e.message || e}`);
  }
  if (applied && (report.patches?.errors?.length || report.errors.some((e) => /^revert patches:/.test(e)))) {
    report.ok = false;
    report.needRestart = false;
    report.cleanup = [];
    return report;
  }

  /* 恢复阶段：shim / flash / override / rules / selectedDefault 五步。
     这几步决定"宿主是否已回到原样"。**任一步失败就必须停下**，不能再往下收集
     清理目录 —— 否则宿主还带着补丁痕迹，插件文件却被删了，用户失去修复材料，
     而界面还可能报"卸载完成"。
     注意 override / rules / selectedDefault 目标本身就是插件自己的产物，
     删不掉不算致命（最多留几份残留文件），所以只有 shim 与 flash 失败拦停：
     这两个没还原成功，宿主目录里的 @deepseek-ai 包还是被改过的状态。 */
  const restoreFatal = [];

  try {
    onStage("shim");
    report.shim = await core.revertAllShims();
    if (state.shim_cmd === "patched" || state.shim_ps1 === "patched" || state.shim_bin === "patched") {
      report.reverted = true;
    }
  } catch (e) {
    report.errors.push(`revert shims: ${e.message || e}`);
    restoreFatal.push("revert shims");
  }

  onStage("flash");
  try {
    report.flash = core.revertCmdFlash(state.ai_base, dshHome);
  } catch (e) {
    report.errors.push(`revert flash: ${e.message || e}`);
    restoreFatal.push("revert flash");
  }

  if (restoreFatal.length) {
    report.ok = false;
    report.needRestart = false;
    report.cleanup = [];
    report.restoreFailed = restoreFatal;
    return report;
  }

  try {
    report.override = await removeOverride(dshHome);
  } catch (e) {
    report.errors.push(`remove override: ${e.message || e}`);
  }

  try {
    report.rules = await resetRules(dshHome);
  } catch (e) {
    report.errors.push(`reset rules: ${e.message || e}`);
  }

  try {
    const preset = clearOwnedSelectedDefault({ dshHome });
    report.presetDefault = { live: preset.live, files: preset.files };
    report.stalePresetDir = removeStaleAgentPresetDir(dshHome, "redteam");
  } catch (e) {
    report.errors.push(`clear selectedDefault: ${e.message || e}`);
  }

  const profiles = listInstalledProfiles(dshHome);
  report.profiles = profiles.map((p) => p.name);
  const unreg = unregisterProfiles(profiles);
  report.stripped = unreg.stripped;
  report.errors.push(...unreg.errors.map((x) => `${x.profile}: ${x.error}`));
  if (unreg.errors.length) {
    report.ok = false;
    report.needRestart = false;
    report.cleanup = [];
    report.drillGrantCleared = false;
    return report;
  }

  try {
    report.drillGrantCleared = clearDrillGrant(dshHome);
  } catch (e) {
    report.ok = false;
    report.needRestart = false;
    report.cleanup = [];
    report.errors.push(`clear drill grant: ${e.message || e}`);
    return report;
  }

  onStage("cleanup");
  report.cleanup = collectCleanupDirs(profiles, dshHome);
  onStage("done");
  return report;
}

export function scheduleCleanupRestart(opts = {}) {
  hostctl.scheduleCleanupRestart(opts);
}
