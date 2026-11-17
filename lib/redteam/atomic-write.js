import { closeSync, fsyncSync, openSync, renameSync, unlinkSync, writeSync } from 'node:fs'

/**
 * 先写临时文件、fsync、再 rename。
 * 直接 writeFileSync 覆盖原文件时，写到一半崩溃会留下半截 JSON；读侧又会把解析错
 * 吞成默认值，用户的设置就无声消失了。
 *
 * 三处细节（都踩过）：
 *  ① 临时文件用 0600 + 'wx' 建。默认 'w' 在 umask 022 下是 0644，而这个文件装的
 *     是 FOFA_KEY / 私钥路径一类的配置，同机其他用户能读。'wx' 还顺带保证不会
 *     意外覆盖到同名残留。
 *  ② writeSync 可能短写（尤其是大 buffer 或某些文件系统），必须循环写到写满，
 *     否则会 rename 出一个被截断的文件。
 *  ③ closeSync 失败不能静默吞：句柄没关好就 rename，Windows 上会因为文件仍被
 *     持有而 EPERM，用户看到的是"保存失败"但查不出原因。失败就抛。
 */
export function atomicWriteFileSync(file, text) {
  const base = file + '.tmp-' + process.pid + '-' + Date.now().toString(36)
  const data = Buffer.isBuffer(text) ? text : Buffer.from(String(text), 'utf8')
  let fd
  let target = base
  try {
    fd = openSync(base, 'wx', 0o600)
  } catch (error) {
    // 同名残留（上次异常退出）就换一个名字重试一次，不要直接失败
    if (error && error.code === 'EEXIST') {
      target = base + '-' + Math.random().toString(36).slice(2, 8)
      fd = openSync(target, 'wx', 0o600)
    } else {
      throw error
    }
  }
  let writeError = null
  try {
    let offset = 0
    while (offset < data.length) {
      const written = writeSync(fd, data, offset, data.length - offset)
      if (!(written > 0)) throw new Error('writeSync wrote 0 bytes at offset ' + offset)
      offset += written
    }
    try {
      fsyncSync(fd)
    } catch {
      /* 部分文件系统不支持 fsync，忽略（原子性仍靠 rename） */
    }
  } catch (error) {
    writeError = error
  }
  try {
    closeSync(fd)
  } catch (error) {
    if (!writeError) writeError = error
  }
  if (writeError) {
    try { unlinkSync(target) } catch { /* ignore */ }
    throw writeError
  }
  try {
    renameSync(target, file)
  } catch (error) {
    try { unlinkSync(target) } catch { /* ignore */ }
    throw error
  }
}
