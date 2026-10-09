const { spawn } = require("node:child_process");
const { resolve } = require("node:path");

const cwd = resolve(__dirname, "..");
const runtime = process.execPath;
let server;
let stopping = false;
const compiler = spawn(runtime, [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.build.json", "--watch", "--preserveWatchOutput", "--pretty", "false"], { cwd, stdio: ["inherit", "pipe", "inherit"] });
let pending = "";
compiler.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  pending += chunk.toString();
  const lines = pending.split(/\r?\n/);
  pending = lines.pop();
  for (const line of lines) {
    if (!line.includes("Found 0 errors.")) continue;
    const previous = server;
    const start = () => {
      if (!stopping) server = spawn(runtime, ["dist/main.js"], { cwd, stdio: "inherit" });
    };
    if (previous && previous.exitCode === null) {
      previous.once("exit", start);
      previous.kill();
    } else start();
  }
});
function stop(code = 0) {
  stopping = true;
  server?.kill();
  compiler.kill();
  process.exitCode = code;
}
compiler.on("error", (error) => { console.error(error); stop(1); });
compiler.on("exit", (code) => stop(code ?? 1));
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
