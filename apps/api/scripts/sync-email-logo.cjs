const path = require("node:path");
const sharp = require("sharp");
// Use the original brand asset; store a small, opaque PNG for email clients.
sharp(path.join(__dirname, "../../web/public/logo.png"))
  .resize({ width: 432 })
  .flatten({ background: "#ffffff" })
  .png({ compressionLevel: 9 })
  .toFile(path.join(__dirname, "../src/otp/templates/assets/reown-logo.png"))
  .then(() => console.log("Email logo updated from apps/web/public/logo.png"))
  .catch(error => { console.error(error); process.exitCode = 1; });
