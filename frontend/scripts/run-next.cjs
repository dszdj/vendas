const { spawnSync } = require("node:child_process");
const path = require("node:path");

require("dotenv").config({ path: path.resolve(__dirname, "..", "..", ".env") });
const frontendPort = Number(process.env.FRONTEND_PORT || 3000);
const backendPort = Number(process.env.BACKEND_PORT || 4000);
for (const [name, port] of [["FRONTEND_PORT", frontendPort], ["BACKEND_PORT", backendPort]]) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} deve ser um número inteiro entre 1 e 65535.`);
  }
}
process.env.PORT = String(frontendPort);
process.env.NEXT_PUBLIC_API_URL ||= `http://localhost:${backendPort}`;
const nextEntry = require.resolve("next");
const nextRoot = path.resolve(path.dirname(nextEntry), "..", "..");
const nextBin = path.join(nextRoot, "dist", "bin", "next");
const result = spawnSync(process.execPath, [nextBin, ...process.argv.slice(2)], {
  env: process.env,
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
