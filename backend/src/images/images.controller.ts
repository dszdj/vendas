import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ImagesService } from "./images.service";

class GenerateImageBody {
  @IsOptional()
  @IsString()
  @MaxLength(1500)
  prompt?: string;
}

interface UploadedImage {
  mimetype: string;
  buffer: Buffer;
}

interface GenerateImageFiles {
  productImages?: UploadedImage[];
  referenceImage?: UploadedImage[];
}

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

@Controller("images")
@UseGuards(JwtAuthGuard)
export class ImagesController {
  constructor(private readonly images: ImagesService) {}

  @Post("generate")
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @UseInterceptors(FileFieldsInterceptor([
    { name: "productImages", maxCount: 4 },
    { name: "referenceImage", maxCount: 1 },
  ], {
    limits: { fileSize: MAX_IMAGE_BYTES, files: 5, fields: 1, fieldSize: 1500 },
    fileFilter: (_request, file, callback) => {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
        callback(new BadRequestException("Use imagens JPEG, PNG ou WebP."), false);
        return;
      }
      callback(null, true);
    },
  }))
  async generate(
    @Body() input: GenerateImageBody,
    @UploadedFiles() files: GenerateImageFiles,
  ) {
    return this.images.generate(input.prompt ?? "", files.productImages ?? [], files.referenceImage ?? []);
  }
}
