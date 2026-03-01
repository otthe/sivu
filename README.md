# Notes:

## todo:
- make flash BIF's more neat?
- ~~ add config-setting for auto-escaping html (+ unsafe_html -function to the context) ~~
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

