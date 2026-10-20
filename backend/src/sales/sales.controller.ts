import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { IsInt, Max, Min } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CreateSaleDto } from "./sale.dto";
import { SalesService } from "./sales.service";

class SalesListQuery {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}

@Controller("sales")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("vendedor", "superadmin")
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get("dashboard")
  getDashboard() {
    return this.sales.getDashboard();
  }

  @Get()
  findAll(@Query() query: SalesListQuery) {
    return this.sales.findAll(query.limit);
  }

  @Post()
  create(@Body() input: CreateSaleDto) {
    return this.sales.create(input);
  }
}
