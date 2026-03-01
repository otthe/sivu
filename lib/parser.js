function compileTemplateString(template) {
  const TOKENS = /(<\?sivu[\s\S]*?\?>|<\?=[\s\S]*?\?>|<\?include\s+["'][\s\S]*?["']\s*\?>)/g;
  let cursor = 0;

  // IMPORTANT: var (not let) so __out becomes a global property in the VM context
  let code = 'var __out = "";\n';

  function addLiteral(text) {
    if (!text) return;
    code += `__out += ${JSON.stringify(text)};\n`;
  }

  // Best-effort: convert "let"/"const" to "var" so bindings are shared across included templates.
  // This intentionally makes template JS behave more like PHP (function/global scope).
  function hoistGlobals(js) {
    return js.replace(/(^|[;\n\r])(\s*)(let|const)\s+/g, "$1$2var ");
  }

  for (const match of template.matchAll(TOKENS)) {
    const tokenIndex = match.index;
    addLiteral(template.slice(cursor, tokenIndex));

    const token = match[0];

    if (token.startsWith("<?=")) {
      let expr = token.slice(3, -2).trim();

      expr = expr
        .replace(/\/\/.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .trim();

      if (expr.endsWith(";")) expr = expr.slice(0, -1).trim();

      //code += `__out += (${expr} ?? "");\n`;
      code += `__out += __toHtml(${expr});\n`; // act according to html autoescaping config
    } else if (token.startsWith("<?sivu")) {
      let jsBlock = token.slice(6, -2);
      jsBlock = hoistGlobals(jsBlock);
      code += jsBlock + "\n";
    } else if (token.startsWith("<?include")) {
      const m = token.match(/<\?include\s+["']([\s\S]*?)["']\s*\?>/);
      const includePath = m ? m[1].trim() : "";
      code += `__out += await __include(${JSON.stringify(includePath)});\n`;
    }

    cursor = tokenIndex + token.length;
  }

  addLiteral(template.slice(cursor));
  code += "return __out;";
  return code;
}

module.exports = { compileTemplateString };