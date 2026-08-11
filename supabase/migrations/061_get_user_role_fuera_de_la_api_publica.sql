-- Migration: 061_get_user_role_fuera_de_la_api_publica
--
-- `get_user_role` deja de ser llamable por REST, sin tocar sus permisos.
--
-- EL PROBLEMA
--
-- Es `SECURITY DEFINER` y cualquiera podía llamarla con la clave anon —que es
-- pública— por `/rest/v1/rpc/get_user_role`, pasándole un UUID y averiguando
-- el rol de esa cuenta. Expone poco (hay que conocer ya el UUID y solo
-- devuelve `admin`/`asesor`/`cliente`), pero es un dato de autorización
-- respondiendo a quien pregunte.
--
-- ⚠️ POR QUÉ NO SE REVOCA EL EXECUTE, que sería lo obvio
--
-- La usan ONCE POLÍTICAS RLS de ocho tablas (productos, pedidos, pedido_items,
-- direcciones_envio, transacciones_pago, roles y user_roles). Las políticas se
-- evalúan con el rol de QUIEN CONSULTA, así que quitarle el EXECUTE a
-- `authenticated` o a `anon` haría fallar esas lecturas por permisos.
--
-- Y fallaría mal: Postgres no garantiza el orden de evaluación de las
-- políticas permisivas, así que con un cortocircuito funcionaría a veces y
-- otras no. Un fallo intermitente en el catálogo es peor que el aviso.
--
-- LO QUE SÍ FUNCIONA: SACARLA DEL ESQUEMA EXPUESTO
--
-- PostgREST solo publica lo que hay en `public`. Moviéndola a `interno`
-- desaparece de la API REST, y las políticas siguen funcionando porque
-- guardan la REFERENCIA INTERNA a la función (su OID), no su nombre — mover
-- de esquema no cambia el OID. Es lo que sugiere el propio advisor de
-- Supabase: «move it out of your exposed API schema».
--
-- PROBADO ANTES DE APLICARLO, en transacción revertida y con `set_config`
-- simulando la sesión del navegador:
--   - `authenticated` (el admin) sigue leyendo user_roles, pedidos,
--     direcciones_envio y transacciones_pago.
--   - `anon` sigue viendo los 19 productos del catálogo.
--   - Ni un error de permisos.
--
-- ⚠️ SI ALGÚN DÍA SE EDITA ESTA FUNCIÓN: el `CREATE OR REPLACE` tiene que ir
-- contra `interno.get_user_role`. Escribirlo contra `public` no la reemplaza:
-- crea OTRA en public, la vuelve a publicar en la API REST y deja dos
-- definiciones que se pueden separar sin que nadie lo note.

CREATE SCHEMA IF NOT EXISTS interno;

COMMENT ON SCHEMA interno IS
  'Funciones que usan las politicas RLS pero que NO deben publicarse en la API REST. PostgREST solo expone public.';

-- USAGE sí, porque las políticas se evalúan con el rol de quien consulta y ese
-- rol tiene que poder llegar a la función. No la abre por REST: lo que decide
-- qué publica PostgREST es el esquema, no estos permisos.
GRANT USAGE ON SCHEMA interno TO anon, authenticated, service_role;

ALTER FUNCTION public.get_user_role(uuid) SET SCHEMA interno;
