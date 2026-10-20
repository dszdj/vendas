import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request, Response } from "express";
import { AuthenticatedUser } from "./current-user.decorator";

type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();
    const token = request.cookies?.access_token as string | undefined;
    if (!token) throw new UnauthorizedException("Faça login para continuar.");

    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; email: string }>(token);
      request.user = { id: payload.sub, email: payload.email };
      return true;
    } catch {
      response.clearCookie("access_token", { path: "/", sameSite: "strict", secure: process.env.NODE_ENV === "production" });
      throw new UnauthorizedException("Sua sessão expirou. Entre novamente.");
    }
  }
}
