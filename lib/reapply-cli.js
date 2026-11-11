import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { reapplyInstalled } from "./reapply.js";

/**
 * 只在被当作脚本直接运行时才执行。
 *
 * 为什么要这道守卫（2026-11-10）：
 *   本文件原来是「import 即执行」—— 只要有任何工具按目录批量 import（打包器、
 *   依赖分析、静态扫描、测试脚本），就会**无意触发一次完整的 revert + apply**，
 *   把宿主所有补丁先回滚再重打一遍，然后 process.exit() 杀掉那个进程。
 *   实测代价：一次误触发出 reverted=48 / applied=56，全机补丁被重写。
 *
 * 正常调用路径（update.js 的 runReapplyChild）是 spawnSync 起子进程跑本文件，
 * argv[1] 就是本文件，守卫不拦它。
 */
function isMain() {
  const entry = process.argv[1];
  if (!entry) return false;
  const norm = (p) => {
    try {
      return realpathSync(p).replace(/\\/g, "/").toLowerCase();
    } catch {
      return resolve(p).replace(/\\/g, "/").toLowerCase();
    }
  };
  try {
    return norm(entry) === norm(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  const result = await reapplyInstalled();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(result.ok ? 0 : 1);
}
