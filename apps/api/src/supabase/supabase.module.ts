import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

/** Token de inyección del cliente Supabase compartido (service_role). */
export const SUPABASE_CLIENT = Symbol("SUPABASE_CLIENT");

/**
 * Provee UN único SupabaseClient (service_role) para toda la API.
 * Global: los servicios lo inyectan con @Inject(SUPABASE_CLIENT) sin
 * importar este módulo. Un solo punto de configuración y mockeable en tests.
 */
@Global()
@Module({
  providers: [
    {
      provide: SUPABASE_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): SupabaseClient =>
        createClient(
          config.getOrThrow("SUPABASE_URL"),
          config.getOrThrow("SUPABASE_SERVICE_ROLE_KEY"),
          { auth: { persistSession: false } },
        ),
    },
  ],
  exports: [SUPABASE_CLIENT],
})
export class SupabaseModule {}
