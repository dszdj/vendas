import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { SqliteService } from "../sqlite.service";
import { CreateSaleDto } from "./sale.dto";

interface SaleRecord {
  id: string;
  customer: string;
  payment: string;
  total_cents: number;
  created_at: string;
}

interface SaleItemRecord {
  product_name: string;
  product_size: string;
  product_color: string;
  quantity: number;
  unit_price_cents: number;
  subtotal_cents: number;
}

@Injectable()
export class SalesService {
  constructor(private readonly sqlite: SqliteService) {}

  create(input: CreateSaleDto) {
    const product = this.sqlite.db.prepare(
      "SELECT id, name, size, color, price_cents, stock FROM products WHERE id = ?",
    ).get(input.productId) as {
      id: string;
      name: string;
      size: string;
      color: string;
      price_cents: number;
      stock: number;
    } | undefined;
    if (!product) throw new NotFoundException("Produto não encontrado.");
    if (product.stock < input.quantity) {
      throw new BadRequestException(`Estoque insuficiente. Disponível: ${product.stock} unidade(s).`);
    }

    const saleId = randomUUID();
    const totalCents = product.price_cents * input.quantity;
    if (!Number.isSafeInteger(totalCents)) {
      throw new BadRequestException("O total da venda é inválido.");
    }

    const saveSale = this.sqlite.db.transaction(() => {
      const stockUpdate = this.sqlite.db.prepare(
        "UPDATE products SET stock = stock - ?, updated_at = ? WHERE id = ? AND stock >= ?",
      ).run(input.quantity, new Date().toISOString(), product.id, input.quantity);
      if (stockUpdate.changes !== 1) {
        throw new BadRequestException("Estoque insuficiente. Atualize os dados e tente novamente.");
      }

      this.sqlite.db.prepare(
        "INSERT INTO sales (id, customer, payment, total_cents) VALUES (?, ?, ?, ?)",
      ).run(saleId, input.customer.trim(), input.payment, totalCents);
      this.sqlite.db.prepare(
        `INSERT INTO sale_items
         (id, sale_id, product_id, product_name, product_size, product_color, quantity, unit_price_cents, subtotal_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        randomUUID(),
        saleId,
        product.id,
        product.name,
        product.size,
        product.color,
        input.quantity,
        product.price_cents,
        totalCents,
      );
    });
    saveSale();
    return this.findOne(saleId);
  }

  findAll(limit = 50) {
    const sales = this.sqlite.db.prepare(
      "SELECT * FROM sales ORDER BY created_at DESC LIMIT ?",
    ).all(limit) as SaleRecord[];
    return sales.map((sale) => this.toSale(sale));
  }

  getDashboard() {
    const metrics = this.sqlite.db.prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN date(created_at, 'localtime') = date('now', 'localtime') THEN total_cents ELSE 0 END), 0) AS revenue_today,
         SUM(CASE WHEN date(created_at, 'localtime') = date('now', 'localtime') THEN 1 ELSE 0 END) AS sales_today,
         COUNT(*) AS total_sales,
         COALESCE(SUM(total_cents), 0) AS total_revenue
       FROM sales`,
    ).get() as { revenue_today: number; sales_today: number | null; total_sales: number; total_revenue: number };
    const dailySales = this.sqlite.db.prepare(
      `SELECT date(created_at, 'localtime') AS day, SUM(total_cents) AS revenue, COUNT(*) AS count
       FROM sales
       WHERE date(created_at, 'localtime') >= date('now', 'localtime', '-6 days')
       GROUP BY date(created_at, 'localtime')`,
    ).all() as Array<{ day: string; revenue: number; count: number }>;
    const avgTicket = metrics.total_sales ? metrics.total_revenue / metrics.total_sales / 100 : 0;
    return {
      revenueToday: metrics.revenue_today / 100,
      salesToday: metrics.sales_today ?? 0,
      averageTicket: avgTicket,
      dailySales: dailySales.map((row) => ({
        date: row.day,
        revenue: row.revenue / 100,
        count: row.count,
      })),
      recentSales: this.findAll(6),
    };
  }

  private findOne(id: string) {
    const sale = this.sqlite.db.prepare("SELECT * FROM sales WHERE id = ?").get(id) as SaleRecord | undefined;
    if (!sale) throw new NotFoundException("Venda não encontrada.");
    return this.toSale(sale);
  }

  private toSale(sale: SaleRecord) {
    const items = this.sqlite.db.prepare(
      `SELECT product_name, product_size, product_color, quantity, unit_price_cents, subtotal_cents
       FROM sale_items WHERE sale_id = ?`,
    ).all(sale.id) as SaleItemRecord[];
    return {
      id: sale.id,
      customer: sale.customer,
      payment: sale.payment,
      total: sale.total_cents / 100,
      createdAt: sale.created_at,
      items: items.map((item) => ({
        productName: item.product_name,
        size: item.product_size,
        color: item.product_color,
        quantity: item.quantity,
        unitPrice: item.unit_price_cents / 100,
        subtotal: item.subtotal_cents / 100,
      })),
    };
  }
}
