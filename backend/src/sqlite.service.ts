import { Injectable, OnModuleDestroy } from "@nestjs/common";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    postal_code TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    street TEXT NOT NULL DEFAULT '',
    neighborhood TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'normal' CHECK (role IN ('normal', 'vendedor', 'superadmin')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS store_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
    category TEXT NOT NULL CHECK (length(category) BETWEEN 1 AND 80),
    size TEXT NOT NULL DEFAULT 'M' CHECK (length(size) <= 20),
    color TEXT NOT NULL DEFAULT '' CHECK (length(color) <= 50),
    cost_cents INTEGER NOT NULL CHECK (cost_cents >= 0),
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    minimum INTEGER NOT NULL DEFAULT 5 CHECK (minimum >= 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS products_name_idx ON products(name);
  CREATE INDEX IF NOT EXISTS products_category_idx ON products(category);
  CREATE INDEX IF NOT EXISTS products_color_idx ON products(color);

  CREATE TABLE IF NOT EXISTS product_images (
    id TEXT PRIMARY KEY NOT NULL,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
    data BLOB NOT NULL,
    is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS product_images_product_idx ON product_images(product_id);
  CREATE UNIQUE INDEX IF NOT EXISTS product_images_primary_idx
    ON product_images(product_id) WHERE is_primary = 1;

  CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY NOT NULL,
    customer TEXT NOT NULL DEFAULT '',
    payment TEXT NOT NULL CHECK (payment IN ('Pix', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro')),
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS sale_items (
    id TEXT PRIMARY KEY NOT NULL,
    sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    product_size TEXT NOT NULL,
    product_color TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0)
  );

  CREATE INDEX IF NOT EXISTS sales_created_idx ON sales(created_at DESC);
  CREATE INDEX IF NOT EXISTS sale_items_sale_idx ON sale_items(sale_id);
`;

@Injectable()
export class SqliteService implements OnModuleDestroy {
  readonly db: Database.Database;

  constructor() {
    const configuredPath = process.env.DATABASE_PATH?.trim() || "../data/aura-vendas.db";
    const databasePath = configuredPath === ":memory:"
      ? configuredPath
      : isAbsolute(configuredPath)
        ? configuredPath
        : resolve(__dirname, "..", configuredPath);

    if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });

    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
    this.db.exec(SCHEMA);
    this.migrateUsers();
  }

  private migrateUsers(): void {
    const existingColumns = new Set(
      (this.db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>)
        .map((column) => column.name),
    );
    const migrations: Array<[string, string]> = [
      ["first_name", "TEXT NOT NULL DEFAULT ''"],
      ["last_name", "TEXT NOT NULL DEFAULT ''"],
      ["phone", "TEXT NOT NULL DEFAULT ''"],
      ["postal_code", "TEXT NOT NULL DEFAULT ''"],
      ["state", "TEXT NOT NULL DEFAULT ''"],
      ["city", "TEXT NOT NULL DEFAULT ''"],
      ["street", "TEXT NOT NULL DEFAULT ''"],
      ["neighborhood", "TEXT NOT NULL DEFAULT ''"],
      ["role", "TEXT NOT NULL DEFAULT 'normal' CHECK (role IN ('normal', 'vendedor', 'superadmin'))"],
    ];

    const migrate = this.db.transaction(() => {
      for (const [column, definition] of migrations) {
        if (!existingColumns.has(column)) {
          this.db.exec(`ALTER TABLE users ADD COLUMN ${column} ${definition}`);
        }
      }
    });
    migrate();
  }

  onModuleDestroy(): void {
    this.db.close();
  }
}
