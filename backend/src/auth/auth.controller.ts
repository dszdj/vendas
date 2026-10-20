import { Body, Controller, Get, Post, Res, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Response } from "express";
import { AuthenticatedUser, CurrentUser } from "./current-user.decorator";
import { AuthService } from "./auth.service";
import { LoginDto, RegisterDto } from "./auth.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() credentials: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: AuthenticatedUser }> {
    const { token, user } = await this.auth.login(credentials);
    this.setSessionCookie(response, token, credentials.remember !== false);
    return { user };
  }

  @Post("register")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(
    @Body() input: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: AuthenticatedUser }> {
    const { token, user } = await this.auth.register(input);
    this.setSessionCookie(response, token);
    return { user };
  }

  @Post("logout")
  logout(@Res({ passthrough: true }) response: Response): { success: true } {
    response.clearCookie("access_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    });
    return { success: true };
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  profile(@CurrentUser() user: AuthenticatedUser): Promise<AuthenticatedUser> {
    return this.auth.getProfile(user.id);
  }

  private setSessionCookie(response: Response, token: string, remember = true): void {
    response.cookie("access_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      ...(remember ? { maxAge: SESSION_DURATION_MS } : {}),
    });
  }
}
