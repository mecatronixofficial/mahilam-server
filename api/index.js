// Vercel serverless function: every request is rewritten here (see vercel.json).
// It serves the Nest app compiled by `npm run build` into dist/.
module.exports = require("../dist/serverless").default;
