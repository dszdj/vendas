import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { Request } from "express";

export interface AuthenticatedUser {
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
  role: "normal" | "vendedor" | "superadmin";
  createdAt: string;
}

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
