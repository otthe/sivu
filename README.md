# Not production ready!

## Example Code:

```html
  <?sivu
    const { formatDate } = await $import("./format.js");
    
    // top level variables are globally scoped
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
    <button type="submit">Add todo</button>
  </form>

  <?sivu for (const todo of todos) { ?>
      <h4>
        <?= todo.task_name ?>
      </h4>
      <p>
        <?= formatDate(todo.due) ?>
      </p>
      <form method="POST" action="/delete_todo.sivu">
        <?= $csrf($_SESSION) ?>
        <input type="hidden" id="id" name="id" value="<?= todo.id; ?>"><br>
        <button type="submit">Delete</button>
      </form>
  <?sivu } ?>

<?sivu
$_SESSION.user = {
  name: "Testi Testinen",
  isAdmin: true
}
const user = $_SESSION.user;
console.log(user);
?>

<?sivu
if (user) {
  $echo($html("<p>Welcome, " + user.name + "</p>"));
} else {
  $echo($html('<p class="error">You are not logged in.</p>'));
}
?>
```

# Notes:

## todo:
- add session helpers
- add file upload helpers
- path.startsWith might be unsecure on windows
- allow users to perform session_start and session_destroy
- add helmet
- add rate limiting settings
- make sure .sivu files are read only and that user content should never be inserted into root
- include "app.disable("x-powered-by")"
- make flash BIF's more neat?
- ~~add config-setting for auto-escaping html (+ unsafe_html -function to the context)~~
- remove useless std libs from the context creation (it was probably unnecessary to add most of them in the first place)
- make the parser better --> it will probably explode from lightest deviations and won't even give clear error messages
- BUILD FLEXIBLE AND EASY TO MAINTAIN DEBUGGER/ERROR HANDLING LAYERS (userspace / internal)
- ~~consider renaming superglobals and BIF's~~ 
- test memory usage on large amount of cached templates
- test cpu usage when caching templates vs not caching them
- WRITE A LOT OF TESTS!!! espesially for file access
- (optional) make the app factory support multiple apps running on same server
  (in this case i should make sure that templates are not cached globally)
- (optional) built-in form validations (front + backend) --> less boilerplate coding for end users?

## philosophy:
- Wrap nodeJs ecosystem into old PHP format
- Avoid common security pitfalls
- allow users to cut corners and take an glass cannon approach

## things to consider:
- Superglobals are marked with $_-prefix
- Built-in functions are marked with $-prefix
- _layout.sivu is special file where ```<?= $_YIELD(); ?>``` must be called
- .sivu files with "_"-prefix are either partials or actions that cannot be accessed directly
- when calling `_some_action_method.sivu` in code, for example in form submission, you should leave out the "_" -prefix

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