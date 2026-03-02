const test = require("node:test");
const assert = require("node:assert/strict");

// Adjust path if needed:
const { compileTemplateString } = require("../../lib/parser.js");

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

test("compiler emits __out initialization + echo/print/println helpers", () => {
  const code = compileTemplateString("Hello");
  assert.match(code, /var __out = "";\n/);
  assert.match(code, /function echo\(/);
  assert.match(code, /function print\(/);
  assert.match(code, /function println\(/);
  assert.match(code, /return __out;$/);
});

test("literal-only template becomes a JSON-stringified append", () => {
  const code = compileTemplateString("Hello\nWorld");
  assert.ok(hasLine(code, '__out += "Hello\\nWorld";'));
});

/* ----------------------------------------------------------
 * <?= ... ?> expression tests
 * ---------------------------------------------------------- */

test("<?= expr ?> becomes __out += __toHtml(expr)", () => {
  const code = compileTemplateString("A<?= 1 + 2 ?>B");
  assert.ok(code.includes('__out += "A";'));
  assert.ok(code.includes("__out += __toHtml(1 + 2);"));
  assert.ok(code.includes('__out += "B";'));
});

test("<?= expr; ?> trims trailing semicolon", () => {
  const code = compileTemplateString("<?= user.id; ?>");
  assert.ok(code.includes("__out += __toHtml(user.id);"));
  assert.ok(!code.includes("__toHtml(user.id;)"));
});

test("<?= expr ?> strips // and /* */ comments (basic)", () => {
  const tpl = `<?= 1 + 2 // ignore
  ?>`;
  const code = compileTemplateString(tpl);
  assert.ok(code.includes("__out += __toHtml(1 + 2);"));
});

test("<?= expr ?> handles whitespace and newlines", () => {
  const code = compileTemplateString("<?=\n  foo(\n  1,\n 2\n )\n?>");
  assert.ok(code.includes("__out += __toHtml(foo(\n  1,\n 2\n ));") || code.includes("__out += __toHtml(foo(\n  1,\n 2\n ));"));
});

/* ----------------------------------------------------------
 * <?include "..."> tests
 * ---------------------------------------------------------- */

test('<?include "_header.sivu"?> compiles to await __include("_header.sivu")', () => {
  const code = compileTemplateString('<?include "_header.sivu"?>');
  assert.ok(code.includes('__out += await __include("_header.sivu");'));
});

test("include path is trimmed", () => {
  const code = compileTemplateString('<?include "  _header.sivu  "?>');
  assert.ok(code.includes('__out += await __include("_header.sivu");'));
});

test("include works at runtime", async () => {
  const out = await runTemplate('A<?include "_x.sivu"?>B');
  assert.equal(out, "A[INCLUDE:_x.sivu]B");
});

/* ----------------------------------------------------------
 * <?sivu ... ?> block tests (hoisting + raw injection)
 * ---------------------------------------------------------- */

test("<?sivu let/const are hoisted to var (simple)", () => {
  const code = compileTemplateString(`<?sivu
    let a = 1;
    const b = 2;
  ?>`);
  assert.ok(code.includes("var a = 1;"));
  assert.ok(code.includes("var b = 2;"));
  assert.ok(!code.includes("let a"));
  assert.ok(!code.includes("const b"));
});

test("<?sivu for (const x of y) is hoisted to for (var x of y)", () => {
  const code = compileTemplateString(`<?sivu for (const todo of todos) { ?>X<?sivu } ?>`);
  assert.ok(code.includes("for (var todo of todos)"));
});

test("<?sivu blocks can be interleaved with literals", async () => {
  const tpl = `A<?sivu var x = 2; ?>B<?= x ?>C`;
  const out = await runTemplate(tpl);
  assert.equal(out, "AB2C");
});

test("echo() writes via __toHtml()", async () => {
  const tpl = `<?sivu echo("<b>Hi</b>"); ?>`;
  const out = await runTemplate(tpl, {
    __toHtml: (v) => String(v).replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
  });
  assert.equal(out, "&lt;b&gt;Hi&lt;/b&gt;");
});

test("println() adds newline", async () => {
  const tpl = `<?sivu println("a"); println("b"); ?>`;
  const out = await runTemplate(tpl);
  assert.equal(out, "a\nb\n");
});

test("print() returns 1 and appends once", async () => {
  const tpl = `<?sivu var r = print("x"); ?><?= r ?>`;
  const out = await runTemplate(tpl);
  assert.equal(out, "x1");
});

/* ----------------------------------------------------------
 * Cursor / tokenization correctness
 * ---------------------------------------------------------- */

test("multiple tokens preserve literal chunks correctly", async () => {
  const tpl = `H<?sivu var a=1; ?>i <?=a?> <?include "_p.sivu"?>!`;
  const out = await runTemplate(tpl);
  assert.equal(out, "Hi 1 [INCLUDE:_p.sivu]!");
});

test("tokens are non-greedy: two expression tags are handled separately", () => {
  const code = compileTemplateString("<?= 1 ?><?= 2 ?>");
  // should contain two append lines
  const count = (code.match(/__out \+= __toHtml/g) || []).length;
  assert.equal(count, 2);
});

/* ----------------------------------------------------------
 * Tests that intentionally FAIL (parser improvement targets)
 * ---------------------------------------------------------- */

/**
 * Improvement target 1:
 * Current <?= ... ?> comment stripping removes // even inside strings.
 * Example: "http://x" becomes "http:" and breaks expressions.
 *
 * This test will likely FAIL with your current implementation.
 * Keep it as a “guard” once you improve parsing.
 */
test("FAILS TODAY: <?= preserves // inside string literals (e.g. URLs)", () => {
  const tpl = `<?= "http://example.com/a//b" ?>`;
  const code = compileTemplateString(tpl);

  // Desired behavior: expression should remain intact
  assert.ok(code.includes('__out += __toHtml("http://example.com/a//b");'));
});

/**
 * Improvement target 2:
 * Current hoistGlobals regex can replace `const`/`let` occurrences inside string literals
 * if the string literal contains a newline followed by 'const '.
 *
 * This test may FAIL depending on the exact string content.
 */
test("FAILS TODAY: hoistGlobals should not rewrite const/let inside string literals", () => {
  const tpl = `<?sivu
    const s = "line1\\nconst should_not_change = 1";
  ?><?= s ?>`;
  const code = compileTemplateString(tpl);

  // Desired: the string literal stays exactly the same
  assert.ok(code.includes('var s = "line1\\nconst should_not_change = 1";'));
});