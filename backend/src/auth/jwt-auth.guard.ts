import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request, Response } from "express";
import { AuthenticatedUser } from "./current-user.decorator";
import { SqliteService } from "../sqlite.service";

type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly sqlite: SqliteService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();
    const token = request.cookies?.access_token as string | undefined;
    if (!token) throw new UnauthorizedException("Faça login para continuar.");

    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
      const user = this.sqlite.db.prepare(`
        SELECT id, email, first_name AS firstName, last_name AS lastName, phone,
          postal_code AS postalCode, state, city, street, neighborhood, role,
          created_at AS createdAt
        FROM users WHERE id = ?
      `).get(payload.sub) as AuthenticatedUser | undefined;
      if (!user) throw new UnauthorizedException("Conta não encontrada.");
      request.user = user;
      return true;
    } catch {
      response.clearCookie("access_token", { path: "/", sameSite: "strict", secure: process.env.NODE_ENV === "production" });
      throw new UnauthorizedException("Sua sessão expirou. Entre novamente.");
    }
  }
}
