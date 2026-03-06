export function compileTemplateString(template) {
  const TOKENS =
    /(<\?sivu[\s\S]*?\?>|<\?=[\s\S]*?\?>|<\?include\s+["'][\s\S]*?["']\s*\?>)/g;
  let cursor = 0;

  // IMPORTANT: var so it becomes a global in the VM context
  let code = 'var __out = "";\n';

  // define echo and its variants inside the template so it can write to __out
  code += `
    function $echo(...values) {
      for (const v of values) __out += __toHtml(v);
      return "";
    }
    function $print(value = "") { $echo(value); return 1; }
    function $println(...values) { $echo(...values, "\\n"); return ""; }
    `;

  function addLiteral(text) {
    if (!text) return;
    code += `__out += ${JSON.stringify(text)};\n`;
  }

  // function hoistGlobals(js) {
  //   return js.replace(/(^|[;\n\r])(\s*)(let|const)\s+/g, "$1$2var ");
  // }

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

      code += `__out += __toHtml(${expr});\n`;
    } else if (token.startsWith("<?sivu")) {
      let jsBlock = token.slice(6, -2);
      //jsBlock = hoistGlobals(jsBlock);
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

  console.log("--------------------------------------------------------------------");
  console.log("CODE: " + code);
  console.log("--------------------------------------------------------------------");

  return code;
}