class TemplateExit extends Error {
  constructor(message = "") {
    super(message);
    this.name = "TemplateExit";
  }
}

class TemplateRedirect extends Error {
  constructor(location, status = 303) {
    super("TEMPLATE_REDIRECT");
    this.name = "TemplateRedirect";
    this.location = location;
    this.status = status;
  }
}

module.exports = {TemplateExit, TemplateRedirect};