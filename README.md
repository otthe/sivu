# Ideas:
- "ergonomic version of PHP"
- built-in form validations (front + backend)
- flash messages

# things to consider:
- let and consts are evaluated as vars (due to block scoping issues)
- $_ - starting variables and functions are superglobals
- _layout.sivu is special file where '<?= $_YIELD(); ?> must be called'