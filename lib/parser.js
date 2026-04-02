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
          value: raw.slice(6, -2).trim()
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

  const tokens = tokenize(template);

  // -------------------------
  // CODE GENERATION
  // -------------------------
  for (const token of tokens) {
    switch (token.type) {
      case "TEXT":
        addLiteral(token.value);
        break;

      case "ECHO": {
        let expr = token.value;

        expr = expr
          .replace(/\/\/.*$/gm, "")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .trim();

        if (expr.endsWith(";")) {
          expr = expr.slice(0, -1).trim();
        }

        code += `__out += __toHtml(${expr});\n`;
        break;
      }

      case "SCRIPT":
        code += token.value + "\n";
        break;

      case "INCLUDE":
        code += `__out += await __include(${JSON.stringify(token.value)});\n`;
        break;
      
      case "META":
        // metadata has already been handled at this point...
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

// export function extractTemplateMetadata(template) {
//   const meta = {};

//   let i = 0;

//   while (i < template.length) {
//     const start = template.indexOf("<?", i);
//     if (start === -1) break;

//     const end = template.indexOf("?>", start);
//     if (end === -1) break;

//     const raw = template.slice(start, end + 2);

//     // ONLY look for metadata tags
//     if (raw.startsWith("<?meta")) {
//       const content = raw.slice(6, -2).trim();

//       // super simple format: key value
//       // e.g. "rateLimit 10"
//       const [key, ...rest] = content.split(/\s+/);
//       const value = rest.join(" ");

//       meta[key] = isNaN(value) ? value : Number(value);
//     }

//     i = end + 2;
//   }

//   return meta;
// }












// export function compileTemplateString(template) {
//   let code = 'var __out = "";\n';

// //   code += `
// // function $echo(...values) {
// //   for (const v of values) __out += __toHtml(v);
// //   return "";
// // }
// // function $print(value = "") { $echo(value); return 1; }
// // function $println(...values) { $echo(...values, "\\n"); return ""; }
// // `;


// code += `
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

//   let cursor = 0;

//   while (cursor < template.length) {
//     const start = template.indexOf("<?", cursor);

//     // No more tags → rest is literal
//     if (start === -1) {
//       addLiteral(template.slice(cursor));
//       break;
//     }

//     // Add literal before tag
//     addLiteral(template.slice(cursor, start));

//     // Find closing ?>
//     const end = template.indexOf("?>", start);
//     if (end === -1) {
//       throw new Error("Unclosed template tag");
//     }

//     const token = template.slice(start, end + 2);

//     // ------------------------
//     // TOKEN HANDLING
//     // ------------------------

//     if (token.startsWith("<?=")) {
//       let expr = token.slice(3, -2).trim();

//       expr = expr
//         .replace(/\/\/.*$/gm, "")
//         .replace(/\/\*[\s\S]*?\*\//g, "")
//         .trim();

//       if (expr.endsWith(";")) {
//         expr = expr.slice(0, -1).trim();
//       }

//       code += `__out += __toHtml(${expr});\n`;

//     } else if (token.startsWith("<?sivu")) {
//       const js = token.slice(6, -2);
//       code += js + "\n";

//     } else if (token.startsWith("<?include")) {
//       const m = token.match(/<\?include\s+["']([\s\S]*?)["']\s*\?>/);
//       const includePath = m ? m[1].trim() : "";

//       code += `__out += await __include(${JSON.stringify(includePath)});\n`;

//     } else {
//       // Unknown tag → treat as literal (safe fallback)
//       addLiteral(token);
//     }

//     cursor = end + 2;
//   }

//   code += "return __out;";
//   return code;
// }