import { IsIn, IsUUID } from "class-validator";
import type { UserRole } from "@valatino/types";

const ROLES: UserRole[] = ["admin", "asesor", "cliente"];

export class AssignRoleDto {
  @IsUUID("4", { message: "user_id debe ser un UUID válido" })
  user_id!: string;

  @IsIn(ROLES, { message: `role debe ser uno de: ${ROLES.join(", ")}` })
  role!: UserRole;
}
