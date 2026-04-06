# Not production ready!

## index.sivu:

```html
<!-- template spesific metadata is read once during server startup -->
<?meta 
  rateLimit 500
  rateWindow 60000
?>

<?sivu
  const { formatDate } = await $import("./format.js");
  // top level variables are globally scoped and shared between files
  let title = "Sivu Todo Example";
  const todos = await db.query("SELECT * FROM todos");
?>

<?include "_header.sivu"?>

<form method="POST" action="/add_todo.sivu">
  <?= $csrf($_SESSION) ?>
  <label for="taskname">Task name</label><br>
  <input type="text" id="taskname" name="taskname"><br>
  <label for="duedate">Task duedate</label><br>
  <input type="datetime-local" id="duedate" name="duedate"><br>
  <button type="submit">Add Todo</button>
</form>

<?sivu for (const todo of todos) { ?>
    <h4><?= todo.task_name ?></h4>
    <?= formatDate(todo.due) ?>
    <form method="POST" action="/delete_todo.sivu">
      <?= $csrf($_SESSION) ?>
      <input type="hidden" id="id" name="id" value="<?= todo.id; ?>"><br>
      <button type="submit">Delete</button>
    </form>
<?sivu } ?>

<?sivu
  console.log("server says hello!");
?>

<script nonce="<?= $nonce(); ?>">
  console.log("client says hello!");
</script>

<?sivu
  $_SESSION.user = {
    name: "Jane Doe",
    isAdmin: true
  }
  const user = $_SESSION.user;
  console.log(user);

  if (user) {
    $echo($html("<p>Welcome, " + user.name + "</p>"));
  } else {
    $echo($html('<p class="error">You are not logged in.</p>'));
  }
?>
```

## test.json.sivu
```html
<?meta  
  useLayout false
  rateLimit 5
  rateWindow 5000 
?>
<?sivu
  $header('content-type', 'application/json');

  const obj = {};
  for (let i = 0; i < 100; i++) {
    obj["field " + i] = "value " + i;
  }

  $echo($raw(JSON.stringify(obj)));
?>
```
## sitemap.xml.sivu
```html
<?meta  
  useLayout false 
?>
<?sivu 
  const urls = ['/', '/about', '/login', '/register', '/contact']; 
  $header('content-type', 'application/xml');
  $status(200);
?>
<?xml version="1.0" encoding="UTF-8"?> 
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <?sivu for (const u of urls) { ?>
    <url>
      <loc>localhost:3000<?= $raw(u); ?></loc>
      <changefreq>weekly</changefreq>
      <priority>0.7</priority>
    </url>
  <?sivu } ?>
</urlset>
```

# Notes:

## todo:
- make sure csrf is only required on form submissions

## local build steps
- npm run build
- npm link

## user project init:
package.json:
```json
{
  "name": "sivu-project",
  "private": true,
  "scripts": {
    "dev": "sivu dev",
    "start": "sivu start"
  },
  "dependencies": {
    "@sivu/framework": "^0.0.1",
    "dotenv": "^17.3.1"
  }
}

```
- sivu init project_name (makes the folders but also causes some failure because it's not npm package rn and needs local link)
- npm link @sivu/framework
- npm i
- npm run dev

## User project structure:
```
├── config.js
├── .env
├── data
│   └── some_sqlite_database.db
├── public
│   └── styles.css
└── root
    ├── backend_js_code.js
    ├── _some_partial.sivu
    ├── index.sivu
    ├── _layout.sivu
    ├── _some_form_action.sivu
├── node_modules
├── package.json
```