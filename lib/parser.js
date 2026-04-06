export function compileTemplateString(template) {
  let code = 'var __out = "";\n';

  code += `
function $echo(...values) {
  for (const v of values) {
    const s = __toHtml(v);
    __out += s;
  }
  return "";
}
function $print(value = "") { $echo(value); return 1; }
function $println(...values) { $echo(...values, "\\n"); return ""; }
`;

  function addLiteral(text) {
    if (!text) return;
    code += `__out += ${JSON.stringify(text)};\n`;
  }

  // -------------------------
  // TOKENIZER
  // -------------------------
  function tokenize(input) {
    const tokens = [];
    let i = 0;

    while (i < input.length) {
      const start = input.indexOf("<?", i);

      if (start === -1) {
        tokens.push({
          type: "TEXT",
          value: input.slice(i),
        });
        break;
      }

      if (start > i) {
        tokens.push({
          type: "TEXT",
          value: input.slice(i, start),
        });
      }

      const end = input.indexOf("?>", start);
      if (end === -1) {
        throw new Error("Unclosed template tag");
      }

      const raw = input.slice(start, end + 2);

      if (raw.startsWith("<?=")) {
        tokens.push({
          type: "ECHO",
          value: raw.slice(3, -2).trim(),
        });
      } else if (raw.startsWith("<?sivu")) {
        tokens.push({
          type: "SCRIPT",
          value: raw.slice(6, -2),
        });
      } else if (raw.startsWith("<?include")) {
        const m = raw.match(/<\?include\s+["']([\s\S]*?)["']\s*\?>/);
        tokens.push({
          type: "INCLUDE",
          value: m ? m[1].trim() : "",
        });
      } else if (raw.startsWith("<?meta")) {
        tokens.push({
          type: "META",
          value: raw.slice(6, -2).trim(),
        });
      } else {
        tokens.push({
          type: "TEXT",
          value: raw,
        });
      }

      i = end + 2;
    }

    return tokens;
  }

  // -------------------------
  // AST
  // -------------------------
  function createAST(tokens) {
    return {
      type: "Program",
      body: tokens.map((token) => {
        switch (token.type) {
          case "TEXT":
            return { type: "Text", value: token.value };

          case "ECHO":
            return { type: "Echo", expression: token.value };

          case "SCRIPT":
            return { type: "Script", code: token.value };

          case "INCLUDE":
            return { type: "Include", path: token.value };

          case "META":
            return { type: "Meta", value: token.value };
        }
      }),
    };
  }

  const tokens = tokenize(template);
  const ast = createAST(tokens);

  // -------------------------
  // CODE GENERATION
  // -------------------------
  let started = false;

  for (const node of ast.body) {
    // 🚀 Skip leading whitespace safely (fixes XML issue)
    if (!started) {
      if (node.type === "Text" && /^[\s\r\n]*$/.test(node.value)) {
        continue;
      }

      // allow script/meta before output without triggering start
      if (node.type === "Script" || node.type === "Meta") {
        if (node.type === "Script") {
          code += node.code + "\n";
        }
        continue;
      }

      started = true;
    }

    switch (node.type) {
      case "Text":
        addLiteral(node.value);
        break;

      case "Echo": {
        let expr = node.expression
          .replace(/\/\/.*$/gm, "")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .trim();

        if (expr.endsWith(";")) {
          expr = expr.slice(0, -1).trim();
        }

        code += `__out += __toHtml(${expr});\n`;
        break;
      }

      case "Script":
        // code += node.code + "\n";
        code += node.code;
        break;

      case "Include":
        code += `__out += await __include(${JSON.stringify(node.path)});\n`;
        break;

      case "Meta":
        // already handled elsewhere
        break;
    }
  }

  code += "return __out;";
  return code;
}


export function extractTemplateMetadata(template) {
  const meta = {};
  let i = 0;

  while (i < template.length) {
    const start = template.indexOf("<?meta", i);
    if (start === -1) break;

    const end = template.indexOf("?>", start);
    if (end === -1) break;

    const raw = template.slice(start + 6, end).trim();

    // supports: key value OR key=value
    const parts = raw.split(/\s+/);

    for (let j = 0; j < parts.length; j++) {
      const part = parts[j];

      if (part.includes("=")) {
        const [k, v] = part.split("=");
        meta[k] = parseValue(v);
      } else if (parts[j + 1]) {
        meta[part] = parseValue(parts[j + 1]);
        j++;
      }
    }

    i = end + 2;
  }

  return meta;
}

function parseValue(v) {
  if (v === "true") return true;
  if (v === "false") return false;
  if (!isNaN(v)) return Number(v);
  return v;
}





// export function compileTemplateString(template) {
//   let code = 'var __out = "";\n';

//   code += `
// function $echo(...values) {
//   for (const v of values) {
//     const s = __toHtml(v);
//     __out += s;
//   }
//   return "";
// }
// function $print(value = "") { $echo(value); return 1; }
// function $println(...values) { $echo(...values, "\\n"); return ""; }
// `;

//   function addLiteral(text) {
//     if (!text) return;
//     code += `__out += ${JSON.stringify(text)};\n`;
//   }

//   // -------------------------
//   // TOKENIZER
//   // -------------------------
//   function tokenize(input) {
//     const tokens = [];
//     let i = 0;

//     while (i < input.length) {
//       const start = input.indexOf("<?", i);

//       if (start === -1) {
//         tokens.push({
//           type: "TEXT",
//           value: input.slice(i),
//         });
//         break;
//       }

//       if (start > i) {
//         tokens.push({
//           type: "TEXT",
//           value: input.slice(i, start),
//         });
//       }

//       const end = input.indexOf("?>", start);
//       if (end === -1) {
//         throw new Error("Unclosed template tag");
//       }

//       const raw = input.slice(start, end + 2);

//       if (raw.startsWith("<?=")) {
//         tokens.push({
//           type: "ECHO",
//           value: raw.slice(3, -2).trim(),
//         });
//       } else if (raw.startsWith("<?sivu")) {
//         tokens.push({
//           type: "SCRIPT",
//           value: raw.slice(6, -2),
//         });
//       } else if (raw.startsWith("<?include")) {
//         const m = raw.match(/<\?include\s+["']([\s\S]*?)["']\s*\?>/);
//         tokens.push({
//           type: "INCLUDE",
//           value: m ? m[1].trim() : "",
//         });
//       } else if (raw.startsWith("<?meta")) {
//         tokens.push({
//           type: "META",
//           value: raw.slice(6, -2).trim()
//         });
//       } else {
//         tokens.push({
//           type: "TEXT",
//           value: raw,
//         });
//       }

//       i = end + 2;
//     }

//     return tokens;
//   }

//   const tokens = tokenize(template);

//   // -------------------------
//   // CODE GENERATION
//   // -------------------------
//   for (const token of tokens) {
//     switch (token.type) {
//       case "TEXT":
//         addLiteral(token.value);
//         break;

//       case "ECHO": {
//         let expr = token.value;

//         expr = expr
//           .replace(/\/\/.*$/gm, "")
//           .replace(/\/\*[\s\S]*?\*\//g, "")
//           .trim();

//         if (expr.endsWith(";")) {
//           expr = expr.slice(0, -1).trim();
//         }

//         code += `__out += __toHtml(${expr});\n`;
//         break;
//       }

//       case "SCRIPT":
//         code += token.value + "\n";
//         break;

//       case "INCLUDE":
//         code += `__out += await __include(${JSON.stringify(token.value)});\n`;
//         break;
      
//       case "META":
//         // metadata has already been handled at this point...
//         break;
//     }
//   }

//   //code += "return __out;";
//   code += "return __out.trimStart();";
//   return code;
// }

// export function extractTemplateMetadata(template) {
//   const meta = {};
//   let i = 0;

//   while (i < template.length) {
//     const start = template.indexOf("<?meta", i);
//     if (start === -1) break;

//     const end = template.indexOf("?>", start);
//     if (end === -1) break;

//     const raw = template.slice(start + 6, end).trim();

//     // supports: key value OR key=value
//     const parts = raw.split(/\s+/);

//     for (let j = 0; j < parts.length; j++) {
//       const part = parts[j];

//       if (part.includes("=")) {
//         const [k, v] = part.split("=");
//         meta[k] = parseValue(v);
//       } else if (parts[j + 1]) {
//         meta[part] = parseValue(parts[j + 1]);
//         j++;
//       }
//     }

//     i = end + 2;
//   }

//   return meta;
// }

// function parseValue(v) {
//   if (v === "true") return true;
//   if (v === "false") return false;
//   if (!isNaN(v)) return Number(v);
//   return v;
// }










// export function compileTemplateString(template) {
//   let code = 'var __out = "";\n';

//   code += `
// function $echo(...values) {
//   for (const v of values) {
//     const s = __toHtml(v);
//     __out += s;
//   }
//   return "";
// }
// function $print(value = "") { $echo(value); return 1; }
// function $println(...values) { $echo(...values, "\\n"); return ""; }
// `;

//   function addLiteral(text) {
//     if (!text) return;
//     code += `__out += ${JSON.stringify(text)};\n`;
//   }

//   // -------------------------
//   // TOKENIZER
//   // -------------------------
//   function tokenize(input) {
//     const tokens = [];
//     let i = 0;

//     while (i < input.length) {
//       const start = input.indexOf("<?", i);

//       if (start === -1) {
//         tokens.push({
//           type: "TEXT",
//           value: input.slice(i),
//         });
//         break;
//       }

//       if (start > i) {
//         tokens.push({
//           type: "TEXT",
//           value: input.slice(i, start),
//         });
//       }

//       const end = input.indexOf("?>", start);
//       if (end === -1) {
//         throw new Error("Unclosed template tag");
//       }

//       const raw = input.slice(start, end + 2);

//       if (raw.startsWith("<?=")) {
//         tokens.push({
//           type: "ECHO",
//           value: raw.slice(3, -2).trim(),
//         });
//       } else if (raw.startsWith("<?sivu")) {
//         tokens.push({
//           type: "SCRIPT",
//           value: raw.slice(6, -2),
//         });
//       } else if (raw.startsWith("<?include")) {
//         const m = raw.match(/<\?include\s+["']([\s\S]*?)["']\s*\?>/);
//         tokens.push({
//           type: "INCLUDE",
//           value: m ? m[1].trim() : "",
//         });
//       } else if (raw.startsWith("<?meta")) {
//         tokens.push({
//           type: "META",
//           value: raw.slice(6, -2).trim()
//         });
      
//         i = end + 2;
//         while (i < input.length && /\s/.test(input[i])) i++;
//         continue;
//         /*else if (raw.startsWith("<?meta")) {
//         tokens.push({
//           type: "META",
//           value: raw.slice(6, -2).trim()
//         });*/
//       } else {
//         tokens.push({
//           type: "TEXT",
//           value: raw,
//         });
//       }

//       //i = end + 2;

//       i = end + 2;

//       //skip whitespace after script/meta blocks
//       while (i < input.length && /\s/.test(input[i])) {
//         i++;
//       }
//     }

//     // Remove leading whitespace-only TEXT tokens
//     while (
//       tokens.length &&
//       tokens[0].type === "TEXT" &&
//       tokens[0].value.trim() === ""
//     ) {
//       tokens.shift();
//     }

//     return tokens;
//   }

//   const tokens = tokenize(template);

//   // -------------------------
//   // CODE GENERATION
//   // -------------------------
//   for (const token of tokens) {
//     switch (token.type) {
//       case "TEXT":
//         addLiteral(token.value);
//         break;

//       case "ECHO": {
//         let expr = token.value;

//         expr = expr
//           .replace(/\/\/.*$/gm, "")
//           .replace(/\/\*[\s\S]*?\*\//g, "")
//           .trim();

//         if (expr.endsWith(";")) {
//           expr = expr.slice(0, -1).trim();
//         }

//         code += `__out += __toHtml(${expr});\n`;
//         break;
//       }

//       case "SCRIPT":
//         code += token.value + "\n";
//         break;

//       case "INCLUDE":
//         code += `__out += await __include(${JSON.stringify(token.value)});\n`;
//         break;
      
//       case "META":
//         // metadata has already been handled at this point...
//         break;
//     }
//   }

//   code += "return __out;";
//   return code;
// }

// export function extractTemplateMetadata(template) {
//   const meta = {};
//   let i = 0;

//   while (i < template.length) {
//     const start = template.indexOf("<?meta", i);
//     if (start === -1) break;

//     const end = template.indexOf("?>", start);
//     if (end === -1) break;

//     const raw = template.slice(start + 6, end).trim();

//     // supports: key value OR key=value
//     const parts = raw.split(/\s+/);

//     for (let j = 0; j < parts.length; j++) {
//       const part = parts[j];

//       if (part.includes("=")) {
//         const [k, v] = part.split("=");
//         meta[k] = parseValue(v);
//       } else if (parts[j + 1]) {
//         meta[part] = parseValue(parts[j + 1]);
//         j++;
//       }
//     }

//     i = end + 2;
//   }

//   return meta;
// }

// function parseValue(v) {
//   if (v === "true") return true;
//   if (v === "false") return false;
//   if (!isNaN(v)) return Number(v);
//   return v;
// }