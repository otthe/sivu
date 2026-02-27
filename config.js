require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  template_dir_location: 'root',
  public_dir_location: 'public',
  public_asset_caching_time: '1d',
  cache_compiled_templates: false,  // toggle on for smaller CPU cost
  root_file: 'index.sivu',
  force_csrf_middleware: true,
  session_secret: process.env.SESSION_SECRET || 'thisismysecret',
  cookie_secure: false, //requires https
  use_layout_file: true,
  data_dir_location: 'data',
};