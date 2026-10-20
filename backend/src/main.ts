import "reflect-metadata";
import { config } from "dotenv";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { isEmail } from "class-validator";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { resolve } from "node:path";
import { AuthService } from "./auth/auth.service";

function validateEnvironment(): void {
  const required = ["JWT_SECRET", "ADMIN_EMAIL", "ADMIN_PASSWORD", "DATABASE_PATH"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Variáveis de ambiente obrigatórias ausentes: ${missing.join(", ")}`);
  }
  if (Buffer.byteLength(process.env.JWT_SECRET ?? "", "utf8") < 32) {
    throw new Error("JWT_SECRET precisa ter pelo menos 32 bytes.");
  }
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (Buffer.byteLength(password, "utf8") < 12 || Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("ADMIN_PASSWORD precisa ter entre 12 e 72 bytes UTF-8.");
  }
  if (!isEmail(process.env.ADMIN_EMAIL ?? "")) {
    throw new Error("ADMIN_EMAIL precisa ser um endereço de e-mail válido.");
  }
  const backendPort = Number(process.env.BACKEND_PORT ?? 4000);
  const frontendPort = Number(process.env.FRONTEND_PORT ?? 3000);
  for (const [name, port] of [["BACKEND_PORT", backendPort], ["FRONTEND_PORT", frontendPort]] as const) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`${name} deve ser um número inteiro entre 1 e 65535.`);
    }
  }
}

async function bootstrap(): Promise<void> {
  config({ path: resolve(__dirname, "../../.env") });
  validateEnvironment();
  const { AppModule } = await import("./app.module");
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? `http://localhost:${process.env.FRONTEND_PORT ?? "3000"}`,
    credentials: true,
  });
  app.setGlobalPrefix("api");
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));
  app.enableShutdownHooks();
  await app.init();
  await app.get(AuthService).initializeAdmin();
  await app.listen(Number(process.env.BACKEND_PORT ?? 4000), "0.0.0.0");
}

void bootstrap();
