import { SetMetadata } from "@nestjs/common";

export type UserRole = "normal" | "vendedor" | "superadmin";
export const ROLES_KEY = "required_roles";
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
