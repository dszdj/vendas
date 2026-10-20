const { spawnSync } = require("node:child_process");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const marker = "# aura-vendas-daily-backup";
const uninstall = process.argv.slice(2).includes("--uninstall");
const unexpectedArguments = process.argv.slice(2).filter((argument) => argument !== "--uninstall");

if (unexpectedArguments.length || process.argv.slice(2).filter((argument) => argument === "--uninstall").length > 1) {
  throw new Error("Uso: npm run backup:schedule [-- --uninstall]");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    ...options,
    stdio: options.input === undefined ? "inherit" : ["pipe", "inherit", "inherit"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
  return result;
}

if (process.platform === "win32") {
  const scriptPath = path.join(__dirname, "install-backup-task.ps1");
  const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath];
  if (uninstall) args.push("-Uninstall");
  run("powershell.exe", args);
} else if (process.platform === "linux") {
  const existing = spawnSync("crontab", ["-l"], { encoding: "utf8" });
  let currentCrontab = existing.stdout ?? "";
  if (existing.error) throw existing.error;
  if (existing.status !== 0) {
    if (existing.status === 1 && /no crontab/i.test(existing.stderr ?? "")) {
      currentCrontab = "";
    } else {
      throw new Error(`Não foi possível ler o crontab: ${(existing.stderr ?? "").trim()}`);
    }
  }

  const lines = currentCrontab.split(/\r?\n/).filter((line) => !line.includes(marker));
  if (!uninstall) {
    const npmCli = process.env.npm_execpath;
    if (!npmCli) throw new Error("Execute o agendamento pelo npm para localizar o executável do npm.");
    const quote = (value) => `'${value.replace(/'/g, "'\\''")}'`;
    lines.push(`0 3 * * * cd ${quote(projectRoot)} && ${quote(process.execPath)} ${quote(path.resolve(npmCli))} run backup ${marker}`);
  }

  const updatedCrontab = `${lines.filter((line) => line.length > 0).join("\n")}\n`;
  run("crontab", ["-"], { input: updatedCrontab, encoding: "utf8" });
  if (!process.exitCode) {
    console.info(uninstall
      ? "Agendamento diário de backup removido do crontab do usuário."
      : "Backup diário agendado para as 03:00 no crontab do usuário.");
  }
} else {
  throw new Error(`Agendamento automático não é compatível com ${process.platform}.`);
}
