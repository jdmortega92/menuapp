-- =====================================================================
-- CIERRE 5b - conciliacion del cobro automatico (fuentes_pago)
-- Fecha: 2026-10-27  |  Convenciones de 20261020000000..0004.
--
-- COMO CORRERLO: en el Supabase SQL Editor, UNA SECCION A LA VEZ.
-- Orden: 0a -> 0b -> 0c -> 0d -> 1 -> 2 -> 3.  La 4 es solo emergencia.
--
-- ORDEN DE DESPLIEGUE: esta migracion va ANTES del deploy (y antes del smoke
-- local). El codigo de 5b escribe 'APROBADO' y 'REVISION', ultimo_cobro_tx_id
-- y ultimo_cobro_referencia: sin la migracion el CHECK viejo rechaza esas
-- escrituras (23514) y las columnas no existen.
--
-- GRANTS: fuentes_pago se escribe SOLO por service role. Se quita todo a anon
-- y toda escritura a authenticated; authenticated conserva SELECT para la
-- policy "duenos leen sus fuentes de pago" (useFuentePago).
-- =====================================================================


-- =====================================================================
-- SECCION 0a - PRE-CHECK: CHECK constraints actuales de fuentes_pago
-- Esperado: incluye fuentes_pago_ultimo_cobro_estado_check (NULL/INICIADO/FALLIDO).
-- =====================================================================
SELECT conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'public.fuentes_pago'::regclass AND contype = 'c'
ORDER BY conname;


-- =====================================================================
-- SECCION 0b - PRE-CHECK: privilegios de TABLA de anon/authenticated/service_role
-- =====================================================================
SELECT grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privilegios
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'fuentes_pago'
  AND grantee IN ('anon', 'authenticated', 'service_role')
GROUP BY grantee
ORDER BY grantee;


-- =====================================================================
-- SECCION 0c - PRE-CHECK: filas por ultimo_cobro_estado
-- Esperado (2026-10-27): FALLIDO 1, NULL 6. Cualquier valor fuera de
-- NULL/INICIADO/FALLIDO es imposible con el CHECK actual.
-- =====================================================================
SELECT ultimo_cobro_estado, count(*) AS filas
FROM public.fuentes_pago
GROUP BY ultimo_cobro_estado
ORDER BY ultimo_cobro_estado NULLS FIRST;


-- =====================================================================
-- SECCION 0d - PRE-CHECK: grants EXPLICITOS de columna (esperado: cero filas)
-- Un REVOKE de tabla no quita un GRANT de columna; si aparece alguno para
-- anon/authenticated, avisar antes de la seccion 1.
-- =====================================================================
SELECT a.attname, a.attacl
FROM pg_attribute a
WHERE a.attrelid = 'public.fuentes_pago'::regclass
  AND a.attnum > 0 AND NOT a.attisdropped
  AND a.attacl IS NOT NULL;


-- =====================================================================
-- SECCION 1 - FIX (todo o nada, re-ejecutable)
-- =====================================================================
BEGIN;

ALTER TABLE public.fuentes_pago ADD COLUMN IF NOT EXISTS ultimo_cobro_tx_id text;
ALTER TABLE public.fuentes_pago ADD COLUMN IF NOT EXISTS ultimo_cobro_referencia text;

-- Id de transaccion de Wompi: '<comercio>-<epoch>-<n>', p. ej. 12345-1668624561-38705.
ALTER TABLE public.fuentes_pago DROP CONSTRAINT IF EXISTS fuentes_pago_ultimo_cobro_tx_id_formato;
ALTER TABLE public.fuentes_pago ADD CONSTRAINT fuentes_pago_ultimo_cobro_tx_id_formato
  CHECK (ultimo_cobro_tx_id IS NULL
         OR (ultimo_cobro_tx_id ~ '^[0-9]+-[0-9]+-[0-9]+$' AND length(ultimo_cobro_tx_id) <= 64));

-- Referencia automatica: maximo actual 70 caracteres (basico/mensual); 80 deja margen.
ALTER TABLE public.fuentes_pago DROP CONSTRAINT IF EXISTS fuentes_pago_ultimo_cobro_referencia_largo;
ALTER TABLE public.fuentes_pago ADD CONSTRAINT fuentes_pago_ultimo_cobro_referencia_largo
  CHECK (ultimo_cobro_referencia IS NULL OR length(ultimo_cobro_referencia) BETWEEN 1 AND 80);

ALTER TABLE public.fuentes_pago DROP CONSTRAINT IF EXISTS fuentes_pago_ultimo_cobro_estado_check;
ALTER TABLE public.fuentes_pago ADD CONSTRAINT fuentes_pago_ultimo_cobro_estado_check
  CHECK (ultimo_cobro_estado IS NULL
         OR ultimo_cobro_estado IN ('INICIADO', 'FALLIDO', 'APROBADO', 'REVISION'));

-- Un tx id de Wompi pertenece a UN solo cobro nuestro.
CREATE UNIQUE INDEX IF NOT EXISTS uq_fuentes_pago_ultimo_cobro_tx_id
  ON public.fuentes_pago (ultimo_cobro_tx_id)
  WHERE ultimo_cobro_tx_id IS NOT NULL;

-- Barrido de conciliacion: solo mira INICIADO viejos.
CREATE INDEX IF NOT EXISTS ix_fuentes_pago_cobro_iniciado_en
  ON public.fuentes_pago (ultimo_cobro_en)
  WHERE ultimo_cobro_estado = 'INICIADO';

REVOKE ALL ON public.fuentes_pago FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.fuentes_pago FROM authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;


-- =====================================================================
-- SECCION 2 - POST-CHECK (solo lectura)
-- =====================================================================
-- 2a. Esperado: 3 filas con las definiciones de la seccion 1.
SELECT conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'public.fuentes_pago'::regclass
  AND conname IN ('fuentes_pago_ultimo_cobro_estado_check',
                  'fuentes_pago_ultimo_cobro_tx_id_formato',
                  'fuentes_pago_ultimo_cobro_referencia_largo')
ORDER BY conname;

-- 2b. Esperado: 2 filas (el UNIQUE parcial y el parcial de INICIADO).
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'fuentes_pago'
  AND indexname IN ('uq_fuentes_pago_ultimo_cobro_tx_id', 'ix_fuentes_pago_cobro_iniciado_en')
ORDER BY indexname;

-- 2c. Esperado: anon todo false; authenticated solo sel true;
--     service_role todo true. any_col_* cubre tambien grants de columna.
SELECT r.rol,
       has_table_privilege(r.rol, 'public.fuentes_pago', 'SELECT')      AS sel,
       has_table_privilege(r.rol, 'public.fuentes_pago', 'INSERT')      AS ins,
       has_table_privilege(r.rol, 'public.fuentes_pago', 'UPDATE')      AS upd,
       has_table_privilege(r.rol, 'public.fuentes_pago', 'DELETE')      AS del,
       has_table_privilege(r.rol, 'public.fuentes_pago', 'TRUNCATE')    AS trunc,
       has_table_privilege(r.rol, 'public.fuentes_pago', 'REFERENCES')  AS refs,
       has_table_privilege(r.rol, 'public.fuentes_pago', 'TRIGGER')     AS trig,
       has_any_column_privilege(r.rol, 'public.fuentes_pago', 'INSERT') AS any_col_ins,
       has_any_column_privilege(r.rol, 'public.fuentes_pago', 'UPDATE') AS any_col_upd
FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(rol)
ORDER BY r.rol;

-- 2d. Esperado: 2 filas, text, nullable YES.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'fuentes_pago'
  AND column_name IN ('ultimo_cobro_tx_id', 'ultimo_cobro_referencia')
ORDER BY column_name;


-- =====================================================================
-- SECCION 3 - PROBE (BEGIN ... ROLLBACK; el DO termina SIEMPRE en
-- RAISE EXCEPTION, asi que nada queda escrito aunque el ROLLBACK faltara)
-- Usa la fila de fuentes_pago mas reciente del restaurante de prueba.
-- =====================================================================
BEGIN;

DO $probe$
DECLARE
  v_id     uuid := 'c8a8c0d2-5887-4dd2-a37a-266fe4b856bf';
  v_owner  uuid;
  v_fuente uuid;
  v_rows   int;
  r_a text; r_b text; r_c text; r_d text; r_e text; r_f text;
  r_g text; r_h text; r_i text; r_j text;
BEGIN
  SELECT usuario_id INTO v_owner FROM public.restaurantes WHERE id = v_id;
  IF NOT FOUND OR v_owner IS NULL THEN
    RAISE EXCEPTION 'PROBE: no existe el restaurante % o no tiene usuario_id', v_id;
  END IF;

  SELECT id INTO v_fuente FROM public.fuentes_pago
  WHERE restaurante_id = v_id ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROBE: el restaurante % no tiene filas en fuentes_pago', v_id;
  END IF;

  -- Como postgres (dueno de la tabla): solo los CHECK.
  -- a. tx id mal formado -> 23514
  BEGIN
    UPDATE public.fuentes_pago SET ultimo_cobro_tx_id = 'abc-123' WHERE id = v_fuente;
    GET DIAGNOSTICS v_rows = ROW_COUNT; r_a := 'OK rows=' || v_rows;
  EXCEPTION WHEN OTHERS THEN r_a := SQLSTATE; END;

  -- b. tx id valido -> OK rows=1
  BEGIN
    UPDATE public.fuentes_pago SET ultimo_cobro_tx_id = '12345-1668624561-38705' WHERE id = v_fuente;
    GET DIAGNOSTICS v_rows = ROW_COUNT; r_b := 'OK rows=' || v_rows;
  EXCEPTION WHEN OTHERS THEN r_b := SQLSTATE; END;

  -- c. referencia de 81 caracteres -> 23514
  BEGIN
    UPDATE public.fuentes_pago SET ultimo_cobro_referencia = repeat('x', 81) WHERE id = v_fuente;
    GET DIAGNOSTICS v_rows = ROW_COUNT; r_c := 'OK rows=' || v_rows;
  EXCEPTION WHEN OTHERS THEN r_c := SQLSTATE; END;

  -- d. estado 'COBRADO' -> 23514
  BEGIN
    UPDATE public.fuentes_pago SET ultimo_cobro_estado = 'COBRADO' WHERE id = v_fuente;
    GET DIAGNOSTICS v_rows = ROW_COUNT; r_d := 'OK rows=' || v_rows;
  EXCEPTION WHEN OTHERS THEN r_d := SQLSTATE; END;

  -- e. estado 'APROBADO' -> OK rows=1
  BEGIN
    UPDATE public.fuentes_pago SET ultimo_cobro_estado = 'APROBADO' WHERE id = v_fuente;
    GET DIAGNOSTICS v_rows = ROW_COUNT; r_e := 'OK rows=' || v_rows;
  EXCEPTION WHEN OTHERS THEN r_e := SQLSTATE; END;

  -- f. estado 'REVISION' -> OK rows=1
  BEGIN
    UPDATE public.fuentes_pago SET ultimo_cobro_estado = 'REVISION' WHERE id = v_fuente;
    GET DIAGNOSTICS v_rows = ROW_COUNT; r_f := 'OK rows=' || v_rows;
  EXCEPTION WHEN OTHERS THEN r_f := SQLSTATE; END;

  -- Como el dueno (authenticated).
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_owner, 'role', 'authenticated')::text,
                     true);
  SET LOCAL ROLE authenticated;

  -- g. UPDATE -> 42501
  BEGIN
    UPDATE public.fuentes_pago SET ultimo_cobro_estado = NULL WHERE restaurante_id = v_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT; r_g := 'OK rows=' || v_rows;
  EXCEPTION WHEN OTHERS THEN r_g := SQLSTATE; END;

  -- h. INSERT -> 42501
  BEGIN
    INSERT INTO public.fuentes_pago (restaurante_id) VALUES (v_id);
    GET DIAGNOSTICS v_rows = ROW_COUNT; r_h := 'OK rows=' || v_rows;
  EXCEPTION WHEN OTHERS THEN r_h := SQLSTATE; END;

  -- i. SELECT propio (useFuentePago) -> OK rows>=1
  BEGIN
    PERFORM 1 FROM public.fuentes_pago WHERE restaurante_id = v_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT; r_i := 'OK rows=' || v_rows;
  EXCEPTION WHEN OTHERS THEN r_i := SQLSTATE; END;

  -- Como anon.
  RESET ROLE;
  SET LOCAL ROLE anon;

  -- j. SELECT -> 42501
  BEGIN
    PERFORM 1 FROM public.fuentes_pago LIMIT 1;
    GET DIAGNOSTICS v_rows = ROW_COUNT; r_j := 'OK rows=' || v_rows;
  EXCEPTION WHEN OTHERS THEN r_j := SQLSTATE; END;

  RAISE EXCEPTION '%', format(
    E'PROBE (rollback garantizado) restaurante=%s fuente=%s\n'
    'a. tx id abc-123:                expected 23514,      got %s\n'
    'b. tx id 12345-1668624561-38705: expected OK rows=1,  got %s\n'
    'c. referencia de 81 caracteres:  expected 23514,      got %s\n'
    'd. estado COBRADO:               expected 23514,      got %s\n'
    'e. estado APROBADO:              expected OK rows=1,  got %s\n'
    'f. estado REVISION:              expected OK rows=1,  got %s\n'
    'g. authenticated UPDATE:         expected 42501,      got %s\n'
    'h. authenticated INSERT:         expected 42501,      got %s\n'
    'i. authenticated SELECT propio:  expected OK rows>=1, got %s\n'
    'j. anon SELECT:                  expected 42501,      got %s',
    v_id, v_fuente, r_a, r_b, r_c, r_d, r_e, r_f, r_g, r_h, r_i, r_j);
END
$probe$;

ROLLBACK;


-- =====================================================================
-- SECCION 4 - ROLLBACK (SOLO EMERGENCIA, todo comentado)
-- OJO: el codigo de 5b escribe APROBADO/REVISION y las dos columnas nuevas.
-- Revertir sin revertir el codigo hace FALLAR el cron y el webhook.
-- Antes de restaurar el CHECK viejo: no debe quedar ninguna fila APROBADO/REVISION.
-- Los REVOKE NO se revierten a proposito (devolver escritura a anon es el hueco).
-- =====================================================================
-- DROP INDEX IF EXISTS public.ix_fuentes_pago_cobro_iniciado_en;
-- DROP INDEX IF EXISTS public.uq_fuentes_pago_ultimo_cobro_tx_id;
-- ALTER TABLE public.fuentes_pago DROP CONSTRAINT IF EXISTS fuentes_pago_ultimo_cobro_estado_check;
-- ALTER TABLE public.fuentes_pago ADD CONSTRAINT fuentes_pago_ultimo_cobro_estado_check
--   CHECK (ultimo_cobro_estado IS NULL OR ultimo_cobro_estado IN ('INICIADO', 'FALLIDO'));
-- ALTER TABLE public.fuentes_pago DROP COLUMN IF EXISTS ultimo_cobro_referencia;
-- ALTER TABLE public.fuentes_pago DROP COLUMN IF EXISTS ultimo_cobro_tx_id;
-- NOTIFY pgrst, 'reload schema';
