import { IsIn } from "class-validator";
import type { PedidoEstado } from "@valatino/types";

const ESTADOS: PedidoEstado[] = [
  "PENDIENTE_PAGO",
  "PROCESANDO",
  "ENVIADO",
  "ENTREGADO",
  "CANCELADO",
  "REEMBOLSADO",
];

export class UpdateEstadoDto {
  @IsIn(ESTADOS, { message: `estado debe ser uno de: ${ESTADOS.join(", ")}` })
  estado!: PedidoEstado;
}
