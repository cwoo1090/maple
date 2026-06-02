function isEscaped(src, pos) {
  let slashCount = 0;
  for (let i = pos - 1; i >= 0 && src[i] === "\\"; i -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function findUnescaped(src, marker, from, max) {
  let pos = from;
  while (pos < max) {
    const match = src.indexOf(marker, pos);
    if (match === -1 || match >= max) return -1;
    if (!isEscaped(src, match)) return match;
    pos = match + marker.length;
  }
  return -1;
}

function mathBlock(state, startLine, endLine, silent) {
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;

  const start = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  const src = state.src;
  let open = "";
  let close = "";

  if (src.startsWith("$$", start)) {
    open = "$$";
    close = "$$";
  } else if (src.startsWith("\\[", start)) {
    open = "\\[";
    close = "\\]";
  } else {
    return false;
  }

  if (silent) return true;

  const firstLineRest = src.slice(start + open.length, max);
  const sameLineClose = findUnescaped(firstLineRest, close, 0, firstLineRest.length);
  let content = "";
  let nextLine = startLine + 1;

  if (sameLineClose >= 0) {
    content = firstLineRest.slice(0, sameLineClose);
  } else {
    if (firstLineRest.trim()) {
      content += `${firstLineRest.trimStart()}\n`;
    }

    let foundClose = false;
    for (; nextLine < endLine; nextLine += 1) {
      const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
      const lineEnd = state.eMarks[nextLine];
      const line = src.slice(lineStart, lineEnd);
      const closeIndex = findUnescaped(line, close, 0, line.length);

      if (closeIndex >= 0) {
        content += line.slice(0, closeIndex);
        nextLine += 1;
        foundClose = true;
        break;
      }

      content += `${line}\n`;
    }

    if (!foundClose) return false;
  }

  const token = state.push("math_block", "math", 0);
  token.block = true;
  token.content = content.trim();
  token.markup = open;
  state.line = nextLine;
  return true;
}

function mathInline(state, silent) {
  const start = state.pos;
  const max = state.posMax;
  const src = state.src;
  let open = "";
  let close = "";

  if (src[start] === "$") {
    if (src[start + 1] === "$" || isEscaped(src, start)) return false;
    open = "$";
    close = "$";
  } else if (src.startsWith("\\(", start)) {
    open = "\\(";
    close = "\\)";
  } else {
    return false;
  }

  const contentStart = start + open.length;
  const contentEnd = findUnescaped(src, close, contentStart, max);
  if (contentEnd === -1) return false;

  const content = src.slice(contentStart, contentEnd);
  if (!content.trim()) return false;

  if (!silent) {
    const token = state.push("math_inline", "math", 0);
    token.content = content.trim();
    token.markup = open;
  }

  state.pos = contentEnd + close.length;
  return true;
}

export function enableMathProtection(md) {
  const escapeHtml = md.utils.escapeHtml;

  md.block.ruler.before("fence", "math_block", mathBlock, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });

  md.inline.ruler.before("escape", "math_inline", mathInline);

  md.renderer.rules.math_block = (tokens, idx) => {
    const token = tokens[idx];
    const open = token.markup === "\\[" ? "\\[" : "$$";
    const close = token.markup === "\\[" ? "\\]" : "$$";
    return `<div class="math math-display">${escapeHtml(
      `${open}\n${token.content}\n${close}`,
    )}</div>\n`;
  };

  md.renderer.rules.math_inline = (tokens, idx) => {
    const token = tokens[idx];
    const open = token.markup === "\\(" ? "\\(" : "$";
    const close = token.markup === "\\(" ? "\\)" : "$";
    return `<span class="math math-inline">${escapeHtml(
      `${open}${token.content}${close}`,
    )}</span>`;
  };
}
