export const PHASE1_KEEP_EXPR =
  'PERSONA_SECTION_NAMES.has(section?.name) || String(section?.name || "").startsWith("dsh-purge") || String(section?.name || "").startsWith("dshpg-")';

/**
 * 把官方 phase-1 白名单放宽到 dsh-purge* + dshpg-*。
 * 已放行 dsh-purge 的旧补丁会升到带 dshpg。
 */
export function widenPhase1KeepFilter(text) {
  const raw = String(text || "");
  const crlf = raw.includes("\r\n");
  let next = raw.replace(/\r\n/g, "\n");
  next = next.replace(
    /PERSONA_SECTION_NAMES\.has\(section\?\.name\) \|\| String\(section\?\.name \|\| ""\)\.startsWith\("dsh-purge"\)(?! \|\| String\(section\?\.name \|\| ""\)\.startsWith\("dshpg-"\))/g,
    PHASE1_KEEP_EXPR,
  );
  next = next.replace(
    /section => PERSONA_SECTION_NAMES\.has\(section\?\.name\)(?! \|\|)/g,
    `section => ${PHASE1_KEEP_EXPR}`,
  );
  return crlf ? next.replace(/\n/g, "\r\n") : next;
}


/**
 * 反向操作：把放宽过的白名单收窄回官方原样（卸载 / 还原时用）。
 *
 * 与 widenPhase1KeepFilter 严格互逆：
 *   widen  : PERSONA_SECTION_NAMES.has(x)                    → PHASE1_KEEP_EXPR
 *            ...startsWith("dsh-purge")                      → PHASE1_KEEP_EXPR
 *   narrow : PHASE1_KEEP_EXPR                                → PERSONA_SECTION_NAMES.has(x)
 *
 * 为什么现在补（2026-11-10 审查发现）：
 *   silenceLiangshenPhase1Strip / silenceOfficialPhase1Strip 会改写宿主（或梁神插件）
 *   的 system-prompt 组装代码，但 revertCmdFlash 里**没有对应的还原分支**，
 *   卸载后宿主源码里留着 dsh-purge/dshpg- 判断。这里补上反向替换，
 *   供 revertCmdFlash 调用。
 */
export function narrowPhase1KeepFilter(text) {
  const raw = String(text || "");
  const crlf = raw.includes("\r\n");
  let next = raw.replace(/\r\n/g, "\n");
  // 带 dshpg- 的完整版 → 官方单人设白名单
  next = next.replace(
    /section => PERSONA_SECTION_NAMES\.has\(section\?\.name\) \|\| String\(section\?\.name \|\| ""\)\.startsWith\("dsh-purge"\) \|\| String\(section\?\.name \|\| ""\)\.startsWith\("dshpg-"\)/g,
    "section => PERSONA_SECTION_NAMES.has(section?.name)",
  );
  // 独立表达式形态（PHASE1_KEEP_EXPR 被拼进 filter(...) 时）
  next = next.replace(
    new RegExp(PHASE1_KEEP_EXPR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
    "PERSONA_SECTION_NAMES.has(section?.name)",
  );
  // 只放行 dsh-purge 的旧补丁版本也要能收窄
  next = next.replace(
    /section => PERSONA_SECTION_NAMES\.has\(section\?\.name\) \|\| String\(section\?\.name \|\| ""\)\.startsWith\("dsh-purge"\)/g,
    "section => PERSONA_SECTION_NAMES.has(section?.name)",
  );
  // 去掉我们加的注释标记行
  next = next.replace(/^\s*\/\/ \[dsh-purge\] phase-1 keep [^\n]*\n/gm, "");
  return crlf ? next.replace(/\n/g, "\r\n") : next;
}
