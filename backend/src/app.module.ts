import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ImagesController } from "./images/images.controller";
import { ImagesService } from "./images/images.service";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { ProductsController } from "./products/products.controller";
import { ProductsService } from "./products/products.service";
import { SalesController } from "./sales/sales.controller";
import { SalesService } from "./sales/sales.service";
import { SqliteService } from "./sqlite.service";
import { StoreController } from "./store/store.controller";
import { StoreSettingsController } from "./store/store-settings.controller";
import { StoreSettingsService } from "./store/store-settings.service";
import { UsersController } from "./users/users.controller";
import { UsersService } from "./users/users.service";
import { RolesGuard } from "./auth/roles.guard";

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: "8h" },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
  ],
  controllers: [
    AuthController, ImagesController, ProductsController, SalesController, StoreController,
    StoreSettingsController, UsersController,
  ],
  providers: [
    SqliteService,
    AuthService,
    ImagesService,
    ProductsService,
    SalesService,
    JwtAuthGuard,
    RolesGuard,
    UsersService,
    StoreSettingsService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
