import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";

const encoded = process.env.DSH_PURGE_RESTART;
if (!encoded) process.exit(1);

let info;
try {
  info = JSON.parse(encoded);
} catch {
  process.exit(1);
}

const port = Number(info.port) || 3080;
const host = typeof info.host === "string" && info.host ? info.host : "127.0.0.1";
const cleanup = Array.isArray(info.cleanup) ? info.cleanup : [];

function spawnEnv() {
  const env = { ...process.env };
  delete env.DSH_PERMISSION_MODE;
  delete env.DSH_PURGE_RESTART;
  return env;
}

function portFree() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port }, () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(true));
  });
}

async function waitFree() {
  for (let i = 0; i < 80; i++) {
    if (await portFree()) return true;
    await new Promise((r) => setTimeout(r, 120));
  }
  return false;
}

/* 只删目录项本身，不跟随符号链接 / Windows junction。
   原实现直接 fs.rmSync(recursive) —— 若 cleanup 里某项是 junction，
   递归删除会顺着链接把外部目标整棵删掉。这里内联 removeTreeNoFollow 的
   核心逻辑（不能 import：本文件要能在插件包被删掉之后继续独立运行）。
   返回 null 表示成功，返回错误串表示失败（由调用方记录并反映到退出码）。 */
function rmTree(dir) {
  if (!dir) return null;
  const root = path.resolve(dir);
  if (root === path.parse(root).root) return 'refusing to remove filesystem root';
  const walk = (file) => {
    let stat;
    try {
      stat = fs.lstatSync(file);
    } catch (e) {
      if (e.code === 'ENOENT') return;
      throw e;
    }
    // lstat 必须在 isDirectory 之前：永远不要 stat / realpath 一个删除目标。
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(file);
      return;
    }
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(file)) walk(path.join(file, name));
      fs.rmdirSync(file); // 非递归，不给原生递归删除留后路
    } else {
      fs.unlinkSync(file);
    }
  };
  const retryable = new Set(['EBUSY', 'EMFILE', 'ENFILE', 'ENOTEMPTY', 'EPERM']);
  for (let attempt = 0; attempt <= 8; attempt++) {
    try {
      walk(root);
      return null;
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      if (attempt >= 8 || !retryable.has(e.code)) return `${dir}: ${e.code || e.message || e}`;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 120 * (attempt + 1));
    }
  }
  return `${dir}: retries exhausted`;
}

const ok = await waitFree();
/* 端口等不到也要清理：以前直接退出，插件的目录和文件就永远留在那里，
   用户以为卸载成功，重启后插件还在。
   但删除失败必须**记下来**（以前被空 catch 吞掉，界面看不出来）：
   失败项写进 cleanup-failed.log 并把退出码改成 2，方便事后排查。 */
const failed = [];
for (const dir of cleanup) {
  const err = rmTree(dir);
  if (err) failed.push(err);
}
if (failed.length) {
  try {
    fs.appendFileSync(
      path.join(process.env.TEMP || '.', 'dsh-purge-uninstall-cleanup-failed.log'),
      `${new Date().toISOString()} ${failed.join(' | ')}\n`,
    );
  } catch {
    /* 日志写不进去不该影响后续 */
  }
}
if (info.helper) {
  try {
    fs.unlinkSync(info.helper);
  } catch {
    // ignore
  }
}

/* 端口没释放就不拉起新进程（会立刻撞端口），但上面的清理已经做完了。
   退出码：0 = 全部正常；1 = 端口没释放；2 = 有目录没删掉。 */
if (!ok) process.exit(1);
if (failed.length) process.exit(2);

const child = spawn(info.execPath, info.argv, {
  detached: true,
  stdio: "ignore",
  cwd: info.cwd || process.cwd(),
  env: spawnEnv(),
  windowsHide: true,
  shell: false,
});

child.on("error", () => process.exit(1));
child.unref();
await new Promise((r) => setTimeout(r, 400));
process.exit(0);
