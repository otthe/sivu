# Example:

```html
  <?sivu
    const { formatDate } = require('./format.js');
    
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
        <?= todo.task_name ?>
      </h4>
      <p>
        <?= formatDate(todo.due) ?>
      </p>
      <form method="POST" action="/delete_todo.sivu">
        <?= csrfField($_SESSION) ?>
        <input type="hidden" id="id" name="id" value="<?= todo.id; ?>"><br>
        <button type="submit">Poista</button>
      </form>
    </div>
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
  echo(html("<p>Welcome, " + user.name + "</p>"));
} else {
  echo(html('<p class="error">You are not logged in.</p>'));
}
?>
```

# Notes:

## todo:
- make flash BIF's more neat?
- ~~add config-setting for auto-escaping html (+ unsafe_html -function to the context)~~
- remove useless std libs from the context creation (it was probably unnecessary to add most of them in the first place)
- move BIF's to their own API?
- make the parser better --> it will probably explode from lightest deviations and won't even give clear error messages
- BUILD FLEXIBLE AND EASY TO MAINTAIN DEBUGGER/ERROR HANDLING LAYERS (userspace / internal)
- consider renaming superglobals and BIF's 
- test memory usage on large amount of cached templates
- test cpu usage when caching templates vs not caching them
- WRITE A LOT OF TESTS!!! espesially for file access
- (optional) make the app factory support multiple apps running on same server
  (in this case i should make sure that templates are not cached globally)
- (optional) built-in form validations (front + backend) --> less boilerplate coding for end users?

## philosophy:
- ergonomic version of old PHP
- only what is necessary
- allow users to cut corners and take an glass cannon approach

## things to consider:
- let and consts are evaluated as vars (due to block scoping issues)
- $_ - starting variables and functions are superglobals
- _layout.sivu is special file where ```<?= $_YIELD(); ?>``` must be called

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

