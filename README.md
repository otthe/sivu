# Ideas:
- "ergonomic version of PHP"
- built-in form validations (front + backend)
- flash messages

# things to consider:
- let and consts are evaluated as vars (due to block scoping issues)
- $_ - starting variables and functions are superglobals
- _layout.sivu is special file where '<?= $_YIELD(); ?> must be called'

# steps

- npm run build
- npm link

# in user project

package:.json
```
{
  "name": "my-sivu-app",
  "private": true,
  "scripts": {
    "dev": "sivu",
    "start": "sivu"
  },
  "dependencies": {
    "@sivu/framework": "^0.0.1"
  }
}
```
- npm i
- npm run dev

- npm link @sivu/framework
- npm run dev