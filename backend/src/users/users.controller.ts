import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { IsIn } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles, UserRole } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { UsersService } from "./users.service";

class UpdateUserRoleDto {
  @IsIn(["normal", "vendedor", "superadmin"])
  role!: UserRole;
}

@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("vendedor", "superadmin")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  findAll() {
    return this.users.findAll();
  }

  @Patch(":id/role")
  @Roles("superadmin")
  updateRole(@Param("id") id: string, @Body() input: UpdateUserRoleDto) {
    return this.users.updateRole(id, input.role);
  }
}
