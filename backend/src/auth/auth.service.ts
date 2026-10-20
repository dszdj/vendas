import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { compare, hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { AuthenticatedUser } from "./current-user.decorator";
import { LoginDto, RegisterDto } from "./auth.dto";
import { SqliteService } from "../sqlite.service";

interface UserRecord {
  id: string;
  email: string;
  password_hash: string;
}

interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  postalCode: string;
  state: string;
  city: string;
  street: string;
  neighborhood: string;
  role: AuthenticatedUser["role"];
  createdAt: string;
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
      this.sqlite.db.prepare("UPDATE users SET role = 'superadmin' WHERE id = ?")
        .run(existing.id);
      return;
    }

    const result = this.sqlite.db.prepare(
      `INSERT OR IGNORE INTO users (id, email, password_hash, first_name, role)
       VALUES (?, ?, ?, 'Administrador', 'superadmin')`,
    ).run(randomUUID(), email, passwordHash);
    if (result.changes) {
      console.info(`Conta administrativa inicial criada para ${email}.`);
    }
    this.sqlite.db.prepare(
      "UPDATE users SET role = 'superadmin' WHERE email = ?",
    ).run(email);
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

    const profile = this.getProfileRecord(user.id);
    if (!profile) throw new UnauthorizedException("Conta não encontrada.");
    const token = await this.jwt.signAsync({ sub: profile.id });
    return { token, user: profile };
  }

  async getProfile(id: string): Promise<AuthenticatedUser> {
    const user = this.getProfileRecord(id);
    if (!user) throw new UnauthorizedException("Conta não encontrada.");
    return user;
  }

  async register(input: RegisterDto): Promise<{ token: string; user: AuthenticatedUser }> {
    if (Buffer.byteLength(input.password, "utf8") > 72) {
      throw new BadRequestException("A senha deve ter no máximo 72 bytes.");
    }
    const phoneDigits = input.phone.replace(/\D/g, "").length;
    if (phoneDigits < 10 || phoneDigits > 13) {
      throw new BadRequestException("Informe um número de telefone válido, incluindo DDD.");
    }
    const requiredText = [
      input.firstName, input.lastName, input.postalCode, input.state,
      input.city, input.street, input.neighborhood,
    ];
    if (requiredText.some((value) => !value.trim())) {
      throw new BadRequestException("Preencha todos os campos do cadastro.");
    }

    const email = input.email.trim().toLowerCase();
    const passwordHash = await hash(input.password, 12);
    const id = randomUUID();
    try {
      this.sqlite.db.prepare(`
        INSERT INTO users (
          id, email, password_hash, first_name, last_name, phone, postal_code,
          state, city, street, neighborhood, role
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'normal')
      `).run(
        id, email, passwordHash, input.firstName.trim(), input.lastName.trim(),
        input.phone.trim(), input.postalCode.trim(), input.state.trim(),
        input.city.trim(), input.street.trim(), input.neighborhood.trim(),
      );
    } catch (error) {
      if (
        error instanceof Error
        && "code" in error
        && error.code === "SQLITE_CONSTRAINT_UNIQUE"
      ) {
        throw new ConflictException("Já existe uma conta com este e-mail.");
      }
      throw error;
    }

    const user = this.getProfileRecord(id);
    if (!user) throw new UnauthorizedException("Não foi possível carregar a conta criada.");
    const token = await this.jwt.signAsync({ sub: user.id });
    return { token, user };
  }

  private getProfileRecord(id: string): AuthenticatedUser | undefined {
    return this.sqlite.db.prepare(`
      SELECT id, email, first_name AS firstName, last_name AS lastName, phone,
        postal_code AS postalCode, state, city, street, neighborhood, role,
        created_at AS createdAt
      FROM users WHERE id = ?
    `).get(id) as UserRow | undefined;
  }
}
