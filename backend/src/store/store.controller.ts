import { Controller, Get, Param, Res } from "@nestjs/common";
import type { Response } from "express";
import { ProductsService } from "../products/products.service";
import { StoreSettingsService } from "./store-settings.service";

@Controller("store")
export class StoreController {
  constructor(
    private readonly products: ProductsService,
    private readonly settings: StoreSettingsService,
  ) {}

  @Get("settings")
  getSettings() {
    return this.settings.get();
  }

  @Get("products")
  findProducts() {
    return this.products.findStorefrontProducts();
  }

  @Get("products/:id/images/:imageId")
  getProductImage(@Param("id") id: string, @Param("imageId") imageId: string, @Res() response: Response) {
    const image = this.products.getImage(id, imageId);
    response.setHeader("Cache-Control", "public, max-age=3600");
    response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    response.type(image.mimeType).send(image.data);
  }
}
