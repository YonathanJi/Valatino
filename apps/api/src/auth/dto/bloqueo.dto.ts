import { IsBoolean } from "class-validator";

export class BloqueoDto {
  @IsBoolean({ message: "bloquear debe ser true o false" })
  bloquear!: boolean;
}
