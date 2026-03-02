import crypto from "node:crypto";

function randomSecret() {
  return crypto.randomBytes(24).toString("hex");
}

export const CONFIG_TEMPLATE = `
import "dotenv/config";

export default {
  port: process.env.PORT || 3000,
  template_dir_location: "root",
  public_dir_location: "public",
  data_dir_location: "data",
  root_file: "index.sivu",
  use_layout_file: true,
  public_asset_caching_time: "1d",
  cache_compiled_templates: false, // toggle on for smaller CPU cost
  cache_scripts: true,
  force_csrf_middleware: true,
  autoescape_html: true,
  session_secret: process.env.SESSION_SECRET || "thisismysecret",
  cookie_secure: false // requires https
};
`;

export const STYLES_TEMPLATE = `
/* Reset / base */
* {
  box-sizing: border-box;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
}

body {
  margin: 0;
  padding: 0;
  background: #f5f7fa;
  color: #222;
}

/* Layout */
.container {
  max-width: 720px;
  margin: 2rem auto;
  padding: 0 1rem;
}

/* Form card */
.todo-form {
  background: #ffffff;
  padding: 1.5rem;
  border-radius: 10px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
  margin-bottom: 2rem;
}

.todo-form label {
  font-weight: 600;
  display: block;
  margin-top: 1rem;
}

.todo-form input {
  width: 100%;
  padding: 0.6rem 0.7rem;
  margin-top: 0.3rem;
  border-radius: 6px;
  border: 1px solid #ccc;
  font-size: 0.95rem;
}

.todo-form input:focus {
  outline: none;
  border-color: #4f46e5;
}

.todo-form button {
  margin-top: 1.5rem;
  padding: 0.7rem 1.2rem;
  border-radius: 6px;
  border: none;
  background: #4f46e5;
  color: white;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
}

.todo-form button:hover {
  background: #4338ca;
}

/* Todo items */
.todo {
  background: #ffffff;
  padding: 1.2rem 1.5rem;
  border-radius: 10px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
  margin-bottom: 1rem;
}

.todo h4 {
  margin: 0 0 0.4rem 0;
  font-size: 1.1rem;
}

.todo p {
  margin: 0.2rem 0 1rem 0;
  color: #555;
  line-height: 1.4;
}

/* Due date */
.todo p br + * {
  font-size: 0.85rem;
  color: #777;
}

/* Delete button */
.todo form {
  margin-top: 0.5rem;
}

.todo button {
  background: #ef4444;
  border: none;
  color: white;
  padding: 0.4rem 0.9rem;
  border-radius: 5px;
  font-size: 0.85rem;
  cursor: pointer;
}

.todo button:hover {
  background: #dc2626;
}
`;

export const HEADER_TEMPLATE = `
<header>
  <h1><?= title ?></h1>
</header>
`;

export const LAYOUT_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sivu Home</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>

  <?sivu
    const db = connect("sqlite", { file: "todo.db" });
    db.run("CREATE TABLE IF NOT EXISTS todos (id INTEGER PRIMARY KEY, task_name TEXT, task_desc TEXT, due DATETIME)");
  ?>

  <?= $_YIELD(); ?>

</body>
</html>
`;

export const INDEX_TEMPLATE = `
<div class="container">
  <?sivu
    const { formatDate } = await importModule("./format.js");

    // 'let' and 'const' are actually 'var's
    // top-level variables and functions are global-scoped
    let title = "Sivu Todo Example";
    const todos = await db.query("SELECT * FROM todos");
  ?>
  <?include "_header.sivu"?>

  <div class="todo-form">
    <form method="POST" action="/add_todo.sivu">
      <?= csrfField($_SESSION) ?>
      <label for="taskname">Task name</label><br>
      <input type="text" id="taskname" name="taskname"><br>
      <label for="taskdesc">Task description:</label><br>
      <input type="text" id="taskdesc" name="taskdesc"><br>
      <label for="duedate">Task duedate</label><br>
      <input type="datetime-local" id="duedate" name="duedate"><br>
      <button type="submit">Add todo</button>
    </form>
  </div>

  <?sivu for (const todo of todos) { ?>
    <div class="todo">
      <h4>
        <?= escapeHtml(todo.task_name) ?>
      </h4>
      <p>
        <?= escapeHtml(todo.task_desc) ?>
        <br>
        <?= escapeHtml(formatDate(todo.due)) ?>
      </p>
      <form method="POST" action="/delete_todo.sivu">
        <?= csrfField($_SESSION) ?>
        <input type="hidden" id="id" name="id" value="<?= todo.id; ?>"><br>
        <button type="submit">Delete</button>
      </form>
    </div>
  <?sivu } ?>

</div>
`;

export const ADD_TODO_TEMPLATE = `
<?sivu

  const taskName = $_POST.taskname;
  const taskDesc = $_POST.taskdesc;
  const taskDue = $_POST.duedate;

  db.run("INSERT INTO todos (task_name, task_desc, due) VALUES (?, ?, ?)", [taskName, taskDesc, taskDue]);

  flash("success", "Task added!");
  redirect("/index.sivu?action=task_added");
?>
`;

export const DELETE_TODO_TEMPLATE = `
<?sivu

  db.run(
    "DELETE FROM todos WHERE id = ?",
    [$_POST.id]
  );

  flash("notice", "Task deleted!");
  redirect("/index.sivu");
?>
`;

export const ENV_TEMPLATE = `
SESSION_SECRET = "${randomSecret()}"
`;

export const GITIGNORE_TEMPLATE = `
.env
node_modules
data
package-lock.json
*.db
`;

export const JAVASCRIPT_TEMPLATE = `
function pad(n) {
  return String(n).padStart(2, "0");
}

function formatDate(date) {
  date = new Date(date);
  return \`\${date.getFullYear()}-\${pad(date.getMonth() + 1)}-\${pad(date.getDate())} \` +
         \`\${pad(date.getHours())}:\${pad(date.getMinutes())}\`;
}

export { formatDate };
`;