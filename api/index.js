// Vercel serverless function: every request is rewritten here (see vercel.json).
// It serves the Nest app compiled by `npm run build` into dist/.
export { default } from "../dist/serverless.js";
