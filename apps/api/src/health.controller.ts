import { Controller, Get } from "@nestjs/common";

/** Endpoint público de salud para el health check del proveedor de hosting */
@Controller("health")
export class HealthController {
  @Get()
  check() {
    return { status: "ok" };
  }
}
