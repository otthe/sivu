export class TemplateResponse extends Error {
  constructor(body = "", { status = 200, headers = {} } = {}) {
    super("TEMPLATE_RESPONSE");
    this.name = "TemplateResponse";
    this.status = status;
    this.headers = headers;
    this.body = body;
  }
}