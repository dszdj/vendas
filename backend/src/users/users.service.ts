import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { SqliteService } from "../sqlite.service";
import { UserRole } from "../auth/roles.decorator";

export interface ManagedUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  postalCode: string;
  state: string;
  city: string;
  street: string;
  neighborhood: string;
  role: UserRole;
  createdAt: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly sqlite: SqliteService) {}

  findAll(): ManagedUser[] {
    return this.sqlite.db.prepare(`
      SELECT id, first_name AS firstName, last_name AS lastName, email, phone,
        postal_code AS postalCode, state, city, street, neighborhood, role,
        created_at AS createdAt
      FROM users ORDER BY created_at DESC
    `).all() as ManagedUser[];
  }

  updateRole(id: string, role: UserRole): ManagedUser {
    const update = this.sqlite.db.transaction(() => {
      const user = this.sqlite.db.prepare("SELECT role FROM users WHERE id = ?")
        .get(id) as { role: UserRole } | undefined;
      if (!user) throw new NotFoundException("Usuário não encontrado.");

      if (user.role === "superadmin" && role !== "superadmin") {
        const admins = this.sqlite.db.prepare(
          "SELECT COUNT(*) AS count FROM users WHERE role = 'superadmin'",
        ).get() as { count: number };
        if (admins.count <= 1) {
          throw new BadRequestException("O sistema precisa manter pelo menos um superadmin.");
        }
      }

      this.sqlite.db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
    });
    update();
    return this.sqlite.db.prepare(`
      SELECT id, first_name AS firstName, last_name AS lastName, email, phone,
        postal_code AS postalCode, state, city, street, neighborhood, role,
        created_at AS createdAt
      FROM users WHERE id = ?
    `).get(id) as ManagedUser;
  }
}
