import { BadRequestException, Injectable } from "@nestjs/common";
import { SqliteService } from "../sqlite.service";

export interface StoreSettings {
  storeName: string;
  whatsapp: string;
  instagram: string;
}

@Injectable()
export class StoreSettingsService {
  constructor(private readonly sqlite: SqliteService) {
    const insert = this.sqlite.db.prepare(
      "INSERT OR IGNORE INTO store_settings (key, value) VALUES (?, ?)",
    );
    const seed = this.sqlite.db.transaction(() => {
      insert.run("storeName", process.env.STORE_NAME?.trim() || "Delawear PY");
      insert.run("whatsapp", process.env.NEXT_PUBLIC_STORE_WHATSAPP?.trim() || "");
      insert.run("instagram", "");
    });
    seed();
  }

  get(): StoreSettings {
    const rows = this.sqlite.db.prepare("SELECT key, value FROM store_settings")
      .all() as Array<{ key: keyof StoreSettings; value: string }>;
    const settings: StoreSettings = { storeName: "", whatsapp: "", instagram: "" };
    for (const row of rows) {
      if (row.key in settings) settings[row.key] = row.value;
    }
    return settings;
  }

  update(settings: StoreSettings): StoreSettings {
    const storeName = settings.storeName.trim();
    if (!storeName) throw new BadRequestException("Informe o nome da loja.");
    const instagram = this.normalizeInstagram(settings.instagram);
    const update = this.sqlite.db.prepare(
      "INSERT INTO store_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );
    const save = this.sqlite.db.transaction(() => {
      update.run("storeName", storeName);
      update.run("whatsapp", settings.whatsapp.trim());
      update.run("instagram", instagram);
    });
    save();
    return this.get();
  }

  private normalizeInstagram(value: string): string {
    const input = value.trim();
    if (!input) return "";
    const handle = input.startsWith("@") ? input.slice(1) : input;
    if (/^[A-Za-z0-9._]{1,30}$/.test(handle)) {
      return `https://www.instagram.com/${handle}/`;
    }

    let url: URL;
    try {
      url = new URL(input);
    } catch {
      throw new BadRequestException("Informe um usuário do Instagram ou um link válido.");
    }
    if (
      url.protocol !== "https:"
      || !["instagram.com", "www.instagram.com"].includes(url.hostname.toLowerCase())
      || !/^\/[A-Za-z0-9._]{1,30}\/?$/.test(url.pathname)
    ) {
      throw new BadRequestException("O link precisa apontar para um perfil do Instagram.");
    }
    return `https://www.instagram.com/${url.pathname.slice(1).replace(/\/$/, "")}/`;
  }
}
