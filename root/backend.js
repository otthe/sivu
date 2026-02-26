function backendFunction(){
  return "this is a secret backend function";
}

function printObject(object) {
  console.table(object);
}

module.exports = {backendFunction, printObject};