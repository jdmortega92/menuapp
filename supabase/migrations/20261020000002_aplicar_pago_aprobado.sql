-- =====================================================================
-- CIERRE 3 - Webhook APPROVED atomico: factura + plan en una transaccion
-- Fecha: 2026-10-20  |  Convenciones de 20261020000000 y 20261020000001.
--
-- COMO CORRERLO: en el Supabase SQL Editor, UNA SECCION A LA VEZ.
-- Orden: 0a -> 0b -> 1 -> 2 -> 3.  La 4 es solo emergencia.
--
-- POR QUE (C-1 / D-HIGH-2): /api/wompi/eventos hacia UPDATE del plan y DESPUES
-- insert de la factura, tragandose el error del insert. La factura es la
-- unica huella de idempotencia: si el insert fallaba, cada reentrega de Wompi
-- extendia plan_expira otra vez, y dos entregas concurrentes podian extender
-- las dos. Esta funcion hace las dos escrituras en UNA transaccion:
--   1) INSERT de la factura ON CONFLICT (numero) DO NOTHING. Si no entro, es
--      una reentrega: 'duplicado' y no se toca nada mas.
--   2) UPDATE del plan SOLO si la fila sigue como la leyo la ruta (plan,
--      periodo_plan, plan_expira). Si cambio: RAISE con errcode MA409, que
--      revierte tambien la factura, y Wompi reintenta sobre la fila nueva.
--
-- SEGURIDAD: SECURITY INVOKER y EXECUTE solo para service_role. Supabase da
-- EXECUTE por defecto a anon/authenticated sobre funciones nuevas de public y
-- PostgREST las expone como /rpc: sin el REVOKE, cualquier sesion podria
-- otorgarse un plan pago (un ID-1 nuevo).
--
-- Firma (para GRANT/REVOKE/DROP):
--   public.aplicar_pago_aprobado(uuid, text, integer, text, integer, integer,
--     timestamptz, text, text, timestamptz, text, text, timestamptz)
-- =====================================================================


-- =====================================================================
-- SECCION 0a - PRE-CHECK: columnas reales de facturas (solo lectura)
-- Deben coincidir con los tipos de los parametros p_monto (integer),
-- p_periodo_mes/p_periodo_ano (integer), p_fecha_pago (timestamptz).
-- =====================================================================
SELECT ordinal_position, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'facturas'
ORDER BY ordinal_position;


-- =====================================================================
-- SECCION 0b - PRE-CHECK: funciones existentes con este nombre (solo lectura)
-- Esperado antes de la Seccion 1: cero filas.
-- =====================================================================
SELECT p.oid::regprocedure AS firma,
       p.prosecdef         AS security_definer,
       p.proconfig         AS config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname = 'aplicar_pago_aprobado';


-- =====================================================================
-- SECCION 1 - CREAR + PRIVILEGIOS (todo o nada, re-ejecutable)
-- =====================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.aplicar_pago_aprobado(
  p_restaurante_id    uuid,
  p_numero            text,
  p_monto             integer,
  p_metodo_pago       text,
  p_periodo_mes       integer,
  p_periodo_ano       integer,
  p_fecha_pago        timestamptz,
  p_plan              text,
  p_periodo           text,
  p_plan_expira       timestamptz,
  p_prev_plan         text,
  p_prev_periodo      text,
  p_prev_plan_expira  timestamptz
) RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_factura uuid;
  v_filas   int;
BEGIN
  -- 1) La factura PRIMERO: es la huella de idempotencia. ON CONFLICT sobre el
  --    UNIQUE de numero; si ya existe, esta entrega es una reentrega.
  INSERT INTO public.facturas
    (restaurante_id, numero, monto, metodo_pago, periodo_mes, periodo_ano, fecha_pago, estado)
  VALUES
    (p_restaurante_id, p_numero, p_monto, p_metodo_pago, p_periodo_mes, p_periodo_ano, p_fecha_pago, 'aprobada')
  ON CONFLICT (numero) DO NOTHING
  RETURNING id INTO v_factura;

  IF v_factura IS NULL THEN
    RETURN 'duplicado';
  END IF;

  -- 2) El plan, condicionado a que la fila siga como la leyo la ruta. Las
  --    mismas columnas que escribia la ruta. Un pago cancela cualquier bajada
  --    agendada: quien paga no se esta bajando.
  UPDATE public.restaurantes
     SET plan                    = p_plan,
         periodo_plan            = p_periodo,
         fue_pago                = true,
         plan_expira             = p_plan_expira,
         plan_programado         = NULL,
         fecha_cambio_programado = NULL
   WHERE id = p_restaurante_id
     AND plan         IS NOT DISTINCT FROM p_prev_plan
     AND periodo_plan IS NOT DISTINCT FROM p_prev_periodo
     AND plan_expira  IS NOT DISTINCT FROM p_prev_plan_expira;
  GET DIAGNOSTICS v_filas = ROW_COUNT;

  IF v_filas = 0 THEN
    -- Revierte tambien la factura de arriba: todo o nada.
    RAISE EXCEPTION 'aplicar_pago_aprobado: la fila % cambio entre la lectura y la escritura', p_restaurante_id
      USING ERRCODE = 'MA409';
  END IF;

  RETURN 'aplicado';
END
$fn$;

REVOKE ALL ON FUNCTION public.aplicar_pago_aprobado(
  uuid, text, integer, text, integer, integer, timestamptz, text, text, timestamptz, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.aplicar_pago_aprobado(
  uuid, text, integer, text, integer, integer, timestamptz, text, text, timestamptz, text, text, timestamptz
) TO service_role;

COMMIT;

-- PostgREST cachea el esquema: sin esto /rpc puede no ver la funcion nueva.
NOTIFY pgrst, 'reload schema';


-- =====================================================================
-- SECCION 2 - POST-CHECK (solo lectura)
-- Esperado: anon false, authenticated false, service_role true,
-- security_definer false, config con search_path=public, pg_temp.
-- =====================================================================
SELECT has_function_privilege('anon',
         'public.aplicar_pago_aprobado(uuid, text, integer, text, integer, integer, timestamptz, text, text, timestamptz, text, text, timestamptz)',
         'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated',
         'public.aplicar_pago_aprobado(uuid, text, integer, text, integer, integer, timestamptz, text, text, timestamptz, text, text, timestamptz)',
         'EXECUTE') AS authenticated_execute,
       has_function_privilege('service_role',
         'public.aplicar_pago_aprobado(uuid, text, integer, text, integer, integer, timestamptz, text, text, timestamptz, text, text, timestamptz)',
         'EXECUTE') AS service_role_execute,
       p.prosecdef AS security_definer,
       p.proconfig AS config
FROM pg_proc p
WHERE p.oid = 'public.aplicar_pago_aprobado(uuid, text, integer, text, integer, integer, timestamptz, text, text, timestamptz, text, text, timestamptz)'::regprocedure;


-- =====================================================================
-- SECCION 3 - PROBE (rollback garantizado)
-- Como postgres sobre el restaurante de prueba, con numeros desechables.
-- Cada intento en su propio sub-bloque; termina SIEMPRE en RAISE EXCEPTION,
-- asi que ni facturas ni el plan del restaurante quedan cambiados.
-- =====================================================================
DO $probe$
DECLARE
  v_id          uuid := 'c8a8c0d2-5887-4dd2-a37a-266fe4b856bf';
  v_owner       uuid;
  v_prev_plan   text;
  v_prev_per    text;
  v_prev_exp    timestamptz;
  v_numero      text := 'probe-cierre3-' || substr(md5(random()::text), 1, 8);
  v_hoy         date := current_date;
  r_a text; r_b text; r_c text; r_d text;
BEGIN
  -- ---- como postgres: estado actual de la fila ---------------------------
  SELECT usuario_id, plan, periodo_plan, plan_expira
    INTO v_owner, v_prev_plan, v_prev_per, v_prev_exp
    FROM public.restaurantes WHERE id = v_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROBE: no existe el restaurante %', v_id;
  END IF;

  -- a. prev correctos -> 'aplicado'
  BEGIN
    r_a := public.aplicar_pago_aprobado(
      v_id, v_numero, 29000, 'PROBE',
      extract(month FROM v_hoy)::int, extract(year FROM v_hoy)::int, now(),
      'pro', 'mensual', (v_hoy + 30)::timestamptz,
      v_prev_plan, v_prev_per, v_prev_exp);
  EXCEPTION WHEN OTHERS THEN
    r_a := SQLSTATE;
  END;

  -- b. mismo numero otra vez -> 'duplicado' (la fila ya cambio en (a): da igual,
  --    la factura se detecta antes de mirar el plan)
  BEGIN
    r_b := public.aplicar_pago_aprobado(
      v_id, v_numero, 29000, 'PROBE',
      extract(month FROM v_hoy)::int, extract(year FROM v_hoy)::int, now(),
      'pro', 'mensual', (v_hoy + 30)::timestamptz,
      v_prev_plan, v_prev_per, v_prev_exp);
  EXCEPTION WHEN OTHERS THEN
    r_b := SQLSTATE;
  END;

  -- c. numero nuevo + prev EQUIVOCADOS -> MA409 (y la factura de (c) no queda)
  BEGIN
    r_c := public.aplicar_pago_aprobado(
      v_id, v_numero || '-c', 29000, 'PROBE',
      extract(month FROM v_hoy)::int, extract(year FROM v_hoy)::int, now(),
      'pro', 'mensual', (v_hoy + 30)::timestamptz,
      'no-es-un-plan', v_prev_per, v_prev_exp);
  EXCEPTION WHEN OTHERS THEN
    r_c := SQLSTATE;
  END;

  -- d. como el dueno (authenticated) -> 42501, sin EXECUTE
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_owner, 'role', 'authenticated')::text,
                     true);
  SET LOCAL ROLE authenticated;
  BEGIN
    r_d := public.aplicar_pago_aprobado(
      v_id, v_numero || '-d', 29000, 'PROBE',
      extract(month FROM v_hoy)::int, extract(year FROM v_hoy)::int, now(),
      'pro', 'mensual', (v_hoy + 30)::timestamptz,
      v_prev_plan, v_prev_per, v_prev_exp);
  EXCEPTION WHEN OTHERS THEN
    r_d := SQLSTATE;
  END;

  RAISE EXCEPTION '%', format(
    E'PROBE (rollback garantizado) restaurante=%s numero=%s\n'
    'a. prev correctos:          expected aplicado,  got %s\n'
    'b. mismo numero:            expected duplicado, got %s\n'
    'c. prev equivocados:        expected MA409,     got %s\n'
    'd. como authenticated:      expected 42501,     got %s',
    v_id, v_numero, r_a, r_b, r_c, r_d);
END
$probe$;


-- =====================================================================
-- SECCION 4 - ROLLBACK (SOLO EMERGENCIA, todo comentado)
-- OJO: la ruta /api/wompi/eventos (CIERRE 3) llama a esta funcion. Borrarla
-- sin revertir tambien la ruta hace que TODO APPROVED responda 500.
-- =====================================================================
-- DROP FUNCTION IF EXISTS public.aplicar_pago_aprobado(
--   uuid, text, integer, text, integer, integer, timestamptz, text, text, timestamptz, text, text, timestamptz
-- );
