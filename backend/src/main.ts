import "reflect-metadata";
import { config } from "dotenv";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { isEmail } from "class-validator";
import cookieParser from "cookie-parser";
import helmet from "helmet";
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
}

async function bootstrap(): Promise<void> {
  config({ path: "../.env" });
  validateEnvironment();
  const { AppModule } = await import("./app.module");
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
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
  await app.listen(Number(process.env.PORT ?? 4000), "0.0.0.0");
}

void bootstrap();
