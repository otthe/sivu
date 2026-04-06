import { test, expect } from "vitest";

// Adjust path if needed:
import { compileTemplateString } from "../../lib/parser.js";

/**
 * Executes compiled template code in an async function.
 * NOTE: This is a "runtime simulation" for tests; your real runtime may differ.
 */
async function runTemplate(template, globals = {}) {
  const code = compileTemplateString(template);

  // AsyncFunction constructor
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

  // Provide common globals your compiled code expects
  const provided = {
    __toHtml: (v) => String(v), // keep simple for tests
    __include: async (p) => `[INCLUDE:${p}]`,
    ...globals,
  };

  const keys = Object.keys(provided);
  const values = keys.map((k) => provided[k]);

  // The compiled string is assumed to be an async function body:
  // it contains "await __include(...)" and ends with "return __out;"
  const fn = new AsyncFunction(...keys, code);
  return await fn(...values);
}

function hasLine(code, substring) {
  return code.split("\n").some((l) => l.includes(substring));
}

/* ----------------------------------------------------------
 * Basic shape tests
 * ---------------------------------------------------------- */

// test("compiler emits __out initialization + echo/print/println helpers", () => {
//   const code = compileTemplateString("Hello");
//   console.log("OUTPUT!!!!!!!");
//   console.log(code);
//   expect(code).toMatch(/var __out = "";\n/);
//   expect(code).toMatch(/function $echo\(/);
//   expect(code).toMatch(/function $print\(/);
//   expect(code).toMatch(/function $println\(/);
//   expect(code).toMatch(/return __out;$/);
// });

test("literal-only template becomes a JSON-stringified append", () => {
  const code = compileTemplateString("Hello\nWorld");
  expect(hasLine(code, '__out += "Hello\\nWorld";')).toBe(true);
});

/* ----------------------------------------------------------
 * <?= ... ?> expression tests
 * ---------------------------------------------------------- */

test("<?= expr ?> becomes __out += __toHtml(expr)", () => {
  const code = compileTemplateString("A<?= 1 + 2 ?>B");
  expect(code.includes('__out += "A";')).toBe(true);
  expect(code.includes("__out += __toHtml(1 + 2);")).toBe(true);
  expect(code.includes('__out += "B";')).toBe(true);
});

test("<?= expr; ?> trims trailing semicolon", () => {
  const code = compileTemplateString("<?= user.id; ?>");
  expect(code.includes("__out += __toHtml(user.id);")).toBe(true);
  expect(code.includes("__toHtml(user.id;)")).toBe(false);
});

test("<?= expr ?> strips // and /* */ comments (basic)", () => {
  const tpl = `<?= 1 + 2 // ignore
  ?>`;
  const code = compileTemplateString(tpl);
  expect(code.includes("__out += __toHtml(1 + 2);")).toBe(true);
});

test("<?= expr ?> handles whitespace and newlines", () => {
  const code = compileTemplateString("<?=\n  foo(\n  1,\n 2\n )\n?>");
  // keep tolerant, exact newlines may vary depending on formatter changes
  expect(code.includes("__out += __toHtml(foo(")).toBe(true);
});

/* ----------------------------------------------------------
 * <?include "..."> tests
 * ---------------------------------------------------------- */

test('<?include "_header.sivu"?> compiles to await __include("_header.sivu")', () => {
  const code = compileTemplateString('<?include "_header.sivu"?>');
  expect(code.includes('__out += await __include("_header.sivu");')).toBe(true);
});

test("include path is trimmed", () => {
  const code = compileTemplateString('<?include "  _header.sivu  "?>');
  expect(code.includes('__out += await __include("_header.sivu");')).toBe(true);
});

test("include works at runtime", async () => {
  const out = await runTemplate('A<?include "_x.sivu"?>B');
  expect(out).toBe("A[INCLUDE:_x.sivu]B");
});


test("<?sivu blocks can be interleaved with literals", async () => {
  const tpl = `A<?sivu var x = 2; ?>B<?= x ?>C`;
  const out = await runTemplate(tpl);
  expect(out).toBe("AB2C");
});

test("echo() writes via __toHtml()", async () => {
  const tpl = `<?sivu $echo("<b>Hi</b>"); ?>`;
  const out = await runTemplate(tpl, {
    __toHtml: (v) => String(v).replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
  });
  expect(out).toBe("&lt;b&gt;Hi&lt;/b&gt;");
});

test("println() adds newline", async () => {
  const tpl = `<?sivu $println("a"); $println("b"); ?>`;
  const out = await runTemplate(tpl);
  expect(out).toBe("a\nb\n");
});

test("print() returns 1 and appends once", async () => {
  const tpl = `<?sivu var r = $print("x"); ?><?= r ?>`;
  const out = await runTemplate(tpl);
  expect(out).toBe("x1");
});

/* ----------------------------------------------------------
 * Cursor / tokenization correctness
 * ---------------------------------------------------------- */

test("multiple tokens preserve literal chunks correctly", async () => {
  const tpl = `H<?sivu var a=1; ?>i <?=a?> <?include "_p.sivu"?>!`;
  const out = await runTemplate(tpl);
  expect(out).toBe("Hi 1 [INCLUDE:_p.sivu]!");
});

test("tokens are non-greedy: two expression tags are handled separately", () => {
  const code = compileTemplateString("<?= 1 ?><?= 2 ?>");
  console.log(code);
  const count = (code.match(/__out \+= __toHtml/g) || []).length;
  expect(count).toBe(2);
});

/* ----------------------------------------------------------
 * Tests that intentionally FAIL (parser improvement targets)
 * ---------------------------------------------------------- */

/**
 * Improvement target 1:
 * Current <?= ... ?> comment stripping removes // even inside strings.
 * Example: "http://x" becomes "http:" and breaks expressions.
 *
 * This test is expected to FAIL today.
 */
test.fails("FAILS TODAY: <?= preserves // inside string literals (e.g. URLs)", () => {
  const tpl = `<?= "http://example.com/a//b" ?>`;
  const code = compileTemplateString(tpl);

  // Desired behavior: expression should remain intact
  expect(code.includes('__out += __toHtml("http://example.com/a//b");')).toBe(true);
});