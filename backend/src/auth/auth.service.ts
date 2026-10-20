import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { compare, hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { AuthenticatedUser } from "./current-user.decorator";
import { LoginDto } from "./auth.dto";
import { SqliteService } from "../sqlite.service";

interface UserRecord {
  id: string;
  email: string;
  password_hash: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly sqlite: SqliteService,
    private readonly jwt: JwtService,
  ) {}

  async initializeAdmin(): Promise<void> {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD ?? "";
    if (!email || !password) throw new Error("ADMIN_EMAIL e ADMIN_PASSWORD são obrigatórios.");

    const existing = this.sqlite.db.prepare(
      "SELECT id, password_hash FROM users WHERE email = ?",
    ).get(email) as { id: string; password_hash: string } | undefined;
    const passwordHash = await hash(password, 12);

    if (existing) {
      if (!(await compare(password, existing.password_hash))) {
        this.sqlite.db.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
          .run(passwordHash, existing.id);
        console.info("Senha administrativa atualizada conforme a configuração local.");
      }
      return;
    }

    const existingUsers = this.sqlite.db.prepare("SELECT id FROM users LIMIT 2")
      .all() as { id: string }[];
    if (existingUsers.length === 1) {
      this.sqlite.db.prepare("UPDATE users SET email = ?, password_hash = ? WHERE id = ?")
        .run(email, passwordHash, existingUsers[0].id);
      console.info("Conta administrativa local atualizada conforme a configuração.");
      return;
    }

    const result = this.sqlite.db.prepare(
      "INSERT OR IGNORE INTO users (id, email, password_hash) VALUES (?, ?, ?)",
    ).run(randomUUID(), email, passwordHash);
    if (result.changes) {
      console.info(`Conta administrativa inicial criada para ${email}.`);
    }
  }

  async login(credentials: LoginDto): Promise<{ token: string; user: AuthenticatedUser }> {
    const email = credentials.email.trim().toLowerCase();
    const user = this.sqlite.db.prepare("SELECT id, email, password_hash FROM users WHERE email = ?")
      .get(email) as UserRecord | undefined;
    const validPasswordLength = Buffer.byteLength(credentials.password, "utf8") <= 72;
    const validPassword = user && validPasswordLength
      ? await compare(credentials.password, user.password_hash)
      : false;
    if (!user || !validPassword) throw new UnauthorizedException("E-mail ou senha incorretos.");

    const profile = { id: user.id, email: user.email };
    const token = await this.jwt.signAsync({ sub: profile.id, email: profile.email });
    return { token, user: profile };
  }

  async getProfile(id: string): Promise<AuthenticatedUser> {
    const user = this.sqlite.db.prepare("SELECT id, email FROM users WHERE id = ?")
      .get(id) as AuthenticatedUser | undefined;
    if (!user) throw new UnauthorizedException("Conta não encontrada.");
    return user;
  }
}
