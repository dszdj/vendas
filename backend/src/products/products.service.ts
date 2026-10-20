import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { SqliteService } from "../sqlite.service";
import { CreateProductDto, UpdateProductDto } from "./product.dto";

interface ProductRecord {
  id: string;
  name: string;
  category: string;
  size: string;
  color: string;
  cost_cents: number;
  price_cents: number;
  stock: number;
  minimum: number;
  created_at: string;
  updated_at: string;
}

interface ProductImageRecord {
  id: string;
  product_id: string;
  mime_type: string;
  data: Buffer;
  is_primary: number;
}

interface UploadedProductImage {
  mimetype: string;
  buffer: Buffer;
}

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_PRODUCT_IMAGES = 6;

interface ProductInput {
  name?: string;
  category?: string;
  size?: string;
  color?: string;
  cost?: number;
  price?: number;
  stock?: number;
  minimum?: number;
}

@Injectable()
export class ProductsService {
  constructor(private readonly sqlite: SqliteService) {}

  findStorefrontProducts() {
    return this.findAll().map((product) => ({
      id: product.id,
      name: product.name,
      category: product.category,
      size: product.size,
      color: product.color,
      price: product.price,
      stock: product.stock,
      images: product.images,
    }));
  }

  findAll(search = ""): ReturnType<typeof toProduct>[] {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    const records = query
      ? this.sqlite.db.prepare(
          `SELECT * FROM products
           WHERE instr(lower(name), lower(?)) > 0
              OR instr(lower(category), lower(?)) > 0
              OR instr(lower(color), lower(?)) > 0
              OR instr(lower(size), lower(?)) > 0
           ORDER BY updated_at DESC`,
        ).all(query, query, query, query) as ProductRecord[]
      : this.sqlite.db.prepare("SELECT * FROM products ORDER BY updated_at DESC").all() as ProductRecord[];
    return records.map((record) => toProduct(record, this.findImages(record.id)));
  }

  getSummary() {
    const result = this.sqlite.db.prepare(
      `SELECT COUNT(*) AS products,
              COALESCE(SUM(stock), 0) AS "stockUnits",
              COALESCE(SUM(CASE WHEN stock <= minimum THEN 1 ELSE 0 END), 0) AS "lowStock",
              COUNT(DISTINCT category) AS categories
       FROM products`,
    ).get() as { products: number; stockUnits: number; lowStock: number; categories: number };
    return {
      products: Number(result.products),
      stockUnits: Number(result.stockUnits),
      lowStock: Number(result.lowStock),
      categories: Number(result.categories),
    };
  }

  findOne(id: string): ReturnType<typeof toProduct> {
    return this.findById(id);
  }

  create(input: CreateProductDto): ReturnType<typeof toProduct> {
    const id = randomUUID();
    this.sqlite.db.prepare(
      `INSERT INTO products
       (id, name, category, size, color, cost_cents, price_cents, stock, minimum)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.name.trim(),
      input.category.trim(),
      input.size?.trim() || "M",
      input.color?.trim() ?? "",
      Math.round(input.cost * 100),
      Math.round(input.price * 100),
      input.stock ?? 0,
      input.minimum ?? 5,
    );
    return this.findById(id);
  }

  getImage(productId: string, imageId: string): { mimeType: string; data: Buffer } {
    const image = this.sqlite.db.prepare(
      "SELECT mime_type, data FROM product_images WHERE id = ? AND product_id = ?",
    ).get(imageId, productId) as Pick<ProductImageRecord, "mime_type" | "data"> | undefined;
    if (!image) throw new NotFoundException("Imagem do produto não encontrada.");
    return { mimeType: image.mime_type, data: image.data };
  }

  syncImages(
    productId: string,
    files: UploadedProductImage[],
    keepImageIds: string[],
    primaryImage: string,
  ): ReturnType<typeof toProductImage>[] {
    this.ensureExists(productId);
    if (new Set(keepImageIds).size !== keepImageIds.length) {
      throw new BadRequestException("A lista de imagens do produto é inválida.");
    }
    if (keepImageIds.length + files.length > MAX_PRODUCT_IMAGES) {
      throw new BadRequestException(`Cada produto pode ter no máximo ${MAX_PRODUCT_IMAGES} imagens.`);
    }

    const existingImages = this.sqlite.db.prepare(
      "SELECT id FROM product_images WHERE product_id = ?",
    ).all(productId) as Array<{ id: string }>;
    const existingIds = new Set(existingImages.map((image) => image.id));
    if (keepImageIds.some((id) => !existingIds.has(id))) {
      throw new BadRequestException("Uma ou mais imagens não pertencem a este produto.");
    }

    const supportedTypes: Record<string, (buffer: Buffer) => boolean> = {
      "image/jpeg": (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
      "image/png": (buffer) => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
      "image/webp": (buffer) => buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP",
    };

    for (const file of files) {
      const matchesSignature = supportedTypes[file.mimetype]?.(file.buffer) ?? false;
      if (!matchesSignature) {
        throw new BadRequestException("Use imagens JPEG, PNG ou WebP válidas.");
      }
      if (file.buffer.length > MAX_IMAGE_BYTES) {
        throw new BadRequestException("Cada imagem deve ter no máximo 4 MB.");
      }
    }

    const primaryIndex = primaryImage.startsWith("new:")
      ? Number(primaryImage.slice(4))
      : -1;
    const primaryExistingId = primaryImage.startsWith("existing:")
      ? primaryImage.slice(9)
      : "";
    if (primaryImage && primaryIndex < 0 && !keepImageIds.includes(primaryExistingId)) {
      throw new BadRequestException("Selecione uma imagem principal válida.");
    }
    if (primaryImage.startsWith("new:") && (!Number.isInteger(primaryIndex) || primaryIndex >= files.length)) {
      throw new BadRequestException("Selecione uma imagem principal válida.");
    }
    if (keepImageIds.length + files.length > 0 && !primaryImage) {
      throw new BadRequestException("Selecione a imagem principal do produto.");
    }

    const insert = this.sqlite.db.prepare(
      "INSERT INTO product_images (id, product_id, mime_type, data, is_primary) VALUES (?, ?, ?, ?, ?)",
    );
    const newImageIds: string[] = [];
    const sync = this.sqlite.db.transaction(() => {
      const keepPlaceholders = keepImageIds.map(() => "?").join(", ");
      this.sqlite.db.prepare(
        `DELETE FROM product_images WHERE product_id = ?${keepImageIds.length ? ` AND id NOT IN (${keepPlaceholders})` : ""}`,
      ).run(productId, ...keepImageIds);
      this.sqlite.db.prepare("UPDATE product_images SET is_primary = 0 WHERE product_id = ?").run(productId);
      files.forEach((file) => {
        const id = randomUUID();
        newImageIds.push(id);
        insert.run(id, productId, file.mimetype, file.buffer, 0);
      });
      const primaryId = primaryIndex >= 0 ? newImageIds[primaryIndex] : primaryExistingId;
      if (primaryId) {
        this.sqlite.db.prepare("UPDATE product_images SET is_primary = 1 WHERE id = ? AND product_id = ?")
          .run(primaryId, productId);
      }
    });
    sync();
    return [...keepImageIds, ...newImageIds].map((id) => this.findImage(productId, id));
  }

  update(id: string, input: UpdateProductDto): ReturnType<typeof toProduct> {
    this.ensureExists(id);
    const patch: ProductInput = {
      ...input,
      ...(input.cost === undefined ? {} : { cost: Math.round(input.cost * 100) }),
      ...(input.price === undefined ? {} : { price: Math.round(input.price * 100) }),
      ...(input.name === undefined ? {} : { name: input.name.trim() }),
      ...(input.category === undefined ? {} : { category: input.category.trim() }),
      ...(input.size === undefined ? {} : { size: input.size.trim() }),
      ...(input.color === undefined ? {} : { color: input.color.trim() }),
    };
    const columnMap: Record<keyof ProductInput, string> = {
      name: "name",
      category: "category",
      size: "size",
      color: "color",
      cost: "cost_cents",
      price: "price_cents",
      stock: "stock",
      minimum: "minimum",
    };
    const assignments = Object.entries(patch).filter(([, value]) => value !== undefined);
    if (assignments.length) {
      const updatedAt = new Date().toISOString();
      this.sqlite.db.prepare(
        `UPDATE products SET ${assignments.map(([key]) => `${columnMap[key as keyof ProductInput]} = ?`).join(", ")}, updated_at = ? WHERE id = ?`,
      ).run(...assignments.map(([, value]) => value), updatedAt, id);
    }
    return this.findById(id);
  }

  remove(id: string): { success: true } {
    this.ensureExists(id);
    this.sqlite.db.prepare("DELETE FROM products WHERE id = ?").run(id);
    return { success: true };
  }

  private ensureExists(id: string): ProductRecord {
    const product = this.sqlite.db.prepare("SELECT * FROM products WHERE id = ?")
      .get(id) as ProductRecord | undefined;
    if (!product) throw new NotFoundException("Produto não encontrado.");
    return product;
  }

  private findById(id: string): ReturnType<typeof toProduct> {
    return toProduct(this.ensureExists(id), this.findImages(id));
  }

  private findImages(productId: string): ReturnType<typeof toProductImage>[] {
    const records = this.sqlite.db.prepare(
      "SELECT id, product_id, mime_type, is_primary FROM product_images WHERE product_id = ? ORDER BY created_at, id",
    ).all(productId) as ProductImageRecord[];
    return records.map(toProductImage);
  }

  private findImage(productId: string, imageId: string): ReturnType<typeof toProductImage> {
    const record = this.sqlite.db.prepare(
      "SELECT id, product_id, mime_type, is_primary FROM product_images WHERE product_id = ? AND id = ?",
    ).get(productId, imageId) as ProductImageRecord | undefined;
    if (!record) throw new NotFoundException("Imagem do produto não encontrada.");
    return toProductImage(record);
  }
}

function toProduct(record: ProductRecord, images: ReturnType<typeof toProductImage>[]) {
  return {
    id: record.id,
    name: record.name,
    category: record.category,
    size: record.size,
    color: record.color,
    cost: record.cost_cents / 100,
    price: record.price_cents / 100,
    stock: record.stock,
    minimum: record.minimum,
    images,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function toProductImage(record: ProductImageRecord) {
  return {
    id: record.id,
    mimeType: record.mime_type,
    isPrimary: Boolean(record.is_primary),
  };
}
