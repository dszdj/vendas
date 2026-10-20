import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { IsString, Matches, MaxLength, MinLength } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { StoreSettingsService } from "./store-settings.service";

class UpdateStoreSettingsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  storeName!: string;

  @IsString()
  @Matches(/^[0-9\s()+.-]*$/)
  @MaxLength(30)
  whatsapp!: string;

  @IsString()
  @MaxLength(200)
  instagram!: string;
}

@Controller("settings/store")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("vendedor", "superadmin")
export class StoreSettingsController {
  constructor(private readonly settings: StoreSettingsService) {}

  @Get()
  find() {
    return this.settings.get();
  }

  @Put()
  update(@Body() input: UpdateStoreSettingsDto) {
    return this.settings.update(input);
  }
}
