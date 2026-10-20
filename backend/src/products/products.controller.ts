import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Query, Res, UploadedFiles, UseGuards, UseInterceptors } from "@nestjs/common";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { CreateProductDto, UpdateProductDto } from "./product.dto";
import { ProductsService } from "./products.service";

class ProductSearchQuery {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search = "";
}

interface ProductImageUpload {
  mimetype: string;
  buffer: Buffer;
}

interface ProductImageFiles {
  images?: ProductImageUpload[];
}

class ProductImagesSyncBody {
  @IsString()
  @MaxLength(1200)
  keepImageIds = "[]";

  @IsString()
  @MaxLength(100)
  primaryImage = "";
}

@Controller("products")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("vendedor", "superadmin")
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get("summary")
  getSummary() {
    return this.products.getSummary();
  }

  @Get()
  findAll(@Query() query: ProductSearchQuery) {
    return this.products.findAll(query.search);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.products.findOne(id);
  }

  @Get(":id/images/:imageId")
  async getImage(@Param("id") id: string, @Param("imageId") imageId: string, @Res() response: Response) {
    const image = this.products.getImage(id, imageId);
    response.setHeader("Cache-Control", "private, max-age=86400");
    response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    response.type(image.mimeType).send(image.data);
  }

  @Put(":id/images")
  @UseInterceptors(FileFieldsInterceptor([{ name: "images", maxCount: 6 }], {
    limits: { fileSize: 4 * 1024 * 1024, files: 6 },
    fileFilter: (_request, file, callback) => {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
        callback(new BadRequestException("Use imagens JPEG, PNG ou WebP válidas."), false);
        return;
      }
      callback(null, true);
    },
  }))
  syncImages(
    @Param("id") id: string,
    @Body() input: ProductImagesSyncBody,
    @UploadedFiles() files: ProductImageFiles,
  ) {
    let keepImageIds: unknown;
    try {
      keepImageIds = JSON.parse(input.keepImageIds);
    } catch {
      throw new BadRequestException("A lista de imagens do produto é inválida.");
    }
    if (!Array.isArray(keepImageIds) || !keepImageIds.every((imageId) => typeof imageId === "string")) {
      throw new BadRequestException("A lista de imagens do produto é inválida.");
    }
    return this.products.syncImages(id, files.images ?? [], keepImageIds, input.primaryImage);
  }

  @Post()
  create(@Body() input: CreateProductDto) {
    return this.products.create(input);
  }

  @Put(":id")
  update(@Param("id") id: string, @Body() input: UpdateProductDto) {
    return this.products.update(id, input);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.products.remove(id);
  }
}
