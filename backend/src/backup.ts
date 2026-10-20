import { config } from "dotenv";
import Database from "better-sqlite3";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

config({ path: resolve(__dirname, "../../.env") });

async function createBackup(): Promise<void> {
  const configuredPath = process.env.DATABASE_PATH?.trim();
  if (!configuredPath) throw new Error("DATABASE_PATH não está definido no arquivo .env.");

  const sourcePath = configuredPath === ":memory:"
    ? configuredPath
    : isAbsolute(configuredPath)
      ? configuredPath
      : resolve(process.cwd(), configuredPath);
  if (sourcePath === ":memory:") {
    throw new Error("Não é possível fazer backup de um banco SQLite em memória.");
  }
  if (!existsSync(sourcePath)) {
    throw new Error(`Banco SQLite não encontrado: ${sourcePath}. Inicie o backend ao menos uma vez.`);
  }

  const configuredBackupDirectory = process.env.BACKUP_DIR?.trim();
  const backupDirectory = configuredBackupDirectory
    ? isAbsolute(configuredBackupDirectory)
      ? configuredBackupDirectory
      : resolve(process.cwd(), configuredBackupDirectory)
    : join(process.env.LOCALAPPDATA || homedir(), "AuraStudio", "backups");

  const rawRetention = process.env.BACKUP_RETENTION_DAYS ?? "14";
  const retentionDays = Number(rawRetention);
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    throw new Error("BACKUP_RETENTION_DAYS precisa ser um inteiro positivo.");
  }

  mkdirSync(backupDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "").replace("T", "-").replace("Z", "Z");
  const backupPath = join(backupDirectory, `aura-vendas-${timestamp}.db`);
  const database = new Database(sourcePath, { readonly: true, fileMustExist: true });

  try {
    await database.backup(backupPath);
  } finally {
    database.close();
  }

  const expirationDate = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  for (const filename of readdirSync(backupDirectory)) {
    if (!/^aura-vendas-\d{8}-\d{6}Z\.db$/.test(filename)) continue;
    const oldBackupPath = join(backupDirectory, filename);
    if (statSync(oldBackupPath).mtimeMs < expirationDate) unlinkSync(oldBackupPath);
  }
  console.info(`Backup SQLite criado com sucesso: ${backupPath}`);
}

void createBackup().catch((error: unknown) => {
  console.error("Falha ao criar backup SQLite:", error);
  process.exitCode = 1;
});
