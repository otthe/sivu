class TemplateExit extends Error {
  constructor(message = "") {
    super(message);
    this.name = "TemplateExit";
  }
}

module.exports = {TemplateExit};