-- =====================================================================
-- CIERRE P2b - tema personalizado (restaurantes.tema_fondo / tema_superficie)
-- Fecha: 2026-10-20  |  Convenciones de 20261020000000..0003.
--
-- COMO CORRERLO: en el Supabase SQL Editor, UNA SECCION A LA VEZ.
-- Orden: 0a -> 0b -> 0c -> 1 -> 2 -> 3.  La 4 es solo emergencia.
-- Si 0a o 0b devuelven filas: corregirlas ANTES de la seccion 1 (los CHECK
-- nuevos fallan al crearse si hay filas que no cumplen).
--
-- ORDEN DE DESPLIEGUE: esta migracion va ANTES de cualquier deploy (y antes
-- del smoke local). /config manda tema_fondo y tema_superficie en el UPDATE
-- de Personalizacion para cuentas Pro: sin las columnas, ese guardado falla
-- (ahora con el error visible). El menu publico lee con select('*') y tolera
-- que no existan.
--
-- REGLA AUD-2: columna nueva escrita desde el navegador = GRANT de columna
-- explicito. Sin el, la escritura falla con 42501.
-- =====================================================================


-- =====================================================================
-- SECCION 0a - PRE-CHECK: color_principal con formato invalido (esperado: cero filas)
-- =====================================================================
SELECT id, slug, color_principal
FROM public.restaurantes
WHERE color_principal IS NOT NULL AND color_principal !~ '^#[0-9A-Fa-f]{6}$';


-- =====================================================================
-- SECCION 0b - PRE-CHECK: tema fuera de los cuatro (esperado: cero filas)
-- =====================================================================
SELECT id, slug, tema
FROM public.restaurantes
WHERE tema IS NOT NULL AND tema NOT IN ('claro', 'oscuro', 'natural', 'premium');


-- =====================================================================
-- SECCION 0c - PRE-CHECK: las columnas NO existen (esperado: cero filas)
-- Informativo, segunda consulta: CHECK constraints actuales de restaurantes.
-- =====================================================================
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'restaurantes'
  AND column_name IN ('tema_fondo', 'tema_superficie');

SELECT conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'public.restaurantes'::regclass AND contype = 'c'
ORDER BY conname;


-- =====================================================================
-- SECCION 1 - FIX (todo o nada, re-ejecutable)
-- =====================================================================
BEGIN;

ALTER TABLE public.restaurantes ADD COLUMN IF NOT EXISTS tema_fondo text;
ALTER TABLE public.restaurantes ADD COLUMN IF NOT EXISTS tema_superficie text;

ALTER TABLE public.restaurantes DROP CONSTRAINT IF EXISTS restaurantes_tema_fondo_hex;
ALTER TABLE public.restaurantes ADD CONSTRAINT restaurantes_tema_fondo_hex
  CHECK (tema_fondo IS NULL OR tema_fondo ~ '^#[0-9A-Fa-f]{6}$');

ALTER TABLE public.restaurantes DROP CONSTRAINT IF EXISTS restaurantes_tema_superficie_hex;
ALTER TABLE public.restaurantes ADD CONSTRAINT restaurantes_tema_superficie_hex
  CHECK (tema_superficie IS NULL OR tema_superficie ~ '^#[0-9A-Fa-f]{6}$');

-- Tarjetas propias solo con fondo propio.
ALTER TABLE public.restaurantes DROP CONSTRAINT IF EXISTS restaurantes_tema_superficie_requiere_fondo;
ALTER TABLE public.restaurantes ADD CONSTRAINT restaurantes_tema_superficie_requiere_fondo
  CHECK (tema_superficie IS NULL OR tema_fondo IS NOT NULL);

ALTER TABLE public.restaurantes DROP CONSTRAINT IF EXISTS restaurantes_color_principal_hex;
ALTER TABLE public.restaurantes ADD CONSTRAINT restaurantes_color_principal_hex
  CHECK (color_principal IS NULL OR color_principal ~ '^#[0-9A-Fa-f]{6}$');

ALTER TABLE public.restaurantes DROP CONSTRAINT IF EXISTS restaurantes_tema_valido;
ALTER TABLE public.restaurantes ADD CONSTRAINT restaurantes_tema_valido
  CHECK (tema IS NULL OR tema IN ('claro', 'oscuro', 'natural', 'premium'));

-- Solo UPDATE: el alta (/registro, /completa-perfil) no escribe estas columnas.
GRANT UPDATE (tema_fondo, tema_superficie) ON public.restaurantes TO authenticated;

COMMIT;


-- =====================================================================
-- SECCION 2 - POST-CHECK (solo lectura)
-- Esperado: 5 constraints; 2 filas de columnas con auth_update true,
-- auth_insert false, anon_insert/anon_update false.
-- =====================================================================
SELECT conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'public.restaurantes'::regclass
  AND conname IN ('restaurantes_tema_fondo_hex', 'restaurantes_tema_superficie_hex',
                  'restaurantes_tema_superficie_requiere_fondo',
                  'restaurantes_color_principal_hex', 'restaurantes_tema_valido')
ORDER BY conname;

SELECT c.column_name,
       c.data_type,
       c.is_nullable,
       has_column_privilege('authenticated', 'public.restaurantes', c.column_name, 'UPDATE') AS auth_update,
       has_column_privilege('authenticated', 'public.restaurantes', c.column_name, 'INSERT') AS auth_insert,
       has_column_privilege('anon', 'public.restaurantes', c.column_name, 'INSERT') AS anon_insert,
       has_column_privilege('anon', 'public.restaurantes', c.column_name, 'UPDATE') AS anon_update
FROM information_schema.columns c
WHERE c.table_schema = 'public' AND c.table_name = 'restaurantes'
  AND c.column_name IN ('tema_fondo', 'tema_superficie')
ORDER BY c.column_name;


-- =====================================================================
-- SECCION 3 - PROBE (rollback garantizado)
-- Como el dueno del restaurante de prueba (authenticated). Termina SIEMPRE
-- en RAISE EXCEPTION: nada queda escrito.
-- =====================================================================
DO $probe$
DECLARE
  v_id    uuid := 'c8a8c0d2-5887-4dd2-a37a-266fe4b856bf';
  v_owner uuid;
  v_rows  int;
  r_a text; r_b text; r_c text; r_d text; r_e text; r_f text;
BEGIN
  SELECT usuario_id INTO v_owner FROM public.restaurantes WHERE id = v_id;
  IF NOT FOUND OR v_owner IS NULL THEN
    RAISE EXCEPTION 'PROBE: no existe el restaurante % o no tiene usuario_id', v_id;
  END IF;

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_owner, 'role', 'authenticated')::text,
                     true);
  SET LOCAL ROLE authenticated;

  -- a. fondo valido -> OK rows=1
  BEGIN
    UPDATE public.restaurantes SET tema_fondo = '#3B2A20' WHERE id = v_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    r_a := 'OK rows=' || v_rows;
  EXCEPTION WHEN OTHERS THEN
    r_a := SQLSTATE;
  END;

  -- b. nombre de color -> 23514
  BEGIN
    UPDATE public.restaurantes SET tema_fondo = 'red' WHERE id = v_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    r_b := 'OK rows=' || v_rows;
  EXCEPTION WHEN OTHERS THEN
    r_b := SQLSTATE;
  END;

  -- c. intento de inyeccion CSS -> 23514
  BEGIN
    UPDATE public.restaurantes SET tema_fondo = '#FFFFFF;background:url(x)' WHERE id = v_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    r_c := 'OK rows=' || v_rows;
  EXCEPTION WHEN OTHERS THEN
    r_c := SQLSTATE;
  END;

  -- d. tarjetas sin fondo -> 23514
  BEGIN
    UPDATE public.restaurantes SET tema_fondo = NULL, tema_superficie = '#4A3628' WHERE id = v_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    r_d := 'OK rows=' || v_rows;
  EXCEPTION WHEN OTHERS THEN
    r_d := SQLSTATE;
  END;

  -- e. color_principal no hex -> 23514
  BEGIN
    UPDATE public.restaurantes SET color_principal = 'rgb(1,2,3)' WHERE id = v_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    r_e := 'OK rows=' || v_rows;
  EXCEPTION WHEN OTHERS THEN
    r_e := SQLSTATE;
  END;

  -- f. tema desconocido -> 23514
  BEGIN
    UPDATE public.restaurantes SET tema = 'neon' WHERE id = v_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    r_f := 'OK rows=' || v_rows;
  EXCEPTION WHEN OTHERS THEN
    r_f := SQLSTATE;
  END;

  RAISE EXCEPTION '%', format(
    E'PROBE (rollback garantizado) restaurante=%s dueno=%s\n'
    'a. tema_fondo #3B2A20:                expected OK rows=1, got %s\n'
    'b. tema_fondo red:                    expected 23514,     got %s\n'
    'c. tema_fondo con inyeccion CSS:      expected 23514,     got %s\n'
    'd. tema_superficie sin tema_fondo:    expected 23514,     got %s\n'
    'e. color_principal rgb(1,2,3):        expected 23514,     got %s\n'
    'f. tema neon:                         expected 23514,     got %s',
    v_id, v_owner, r_a, r_b, r_c, r_d, r_e, r_f);
END
$probe$;


-- =====================================================================
-- SECCION 4 - ROLLBACK (SOLO EMERGENCIA, todo comentado)
-- OJO: el codigo desplegado LEE y ESCRIBE tema_fondo y tema_superficie.
-- Borrar las columnas sin revertir el codigo hace FALLAR el guardado de
-- Personalizacion en /config para cuentas Pro.
-- DROP COLUMN se lleva tambien sus CHECK y los grants de columna.
-- =====================================================================
-- ALTER TABLE public.restaurantes DROP CONSTRAINT IF EXISTS restaurantes_color_principal_hex;
-- ALTER TABLE public.restaurantes DROP CONSTRAINT IF EXISTS restaurantes_tema_valido;
-- ALTER TABLE public.restaurantes DROP CONSTRAINT IF EXISTS restaurantes_tema_superficie_requiere_fondo;
-- ALTER TABLE public.restaurantes DROP COLUMN IF EXISTS tema_superficie;
-- ALTER TABLE public.restaurantes DROP COLUMN IF EXISTS tema_fondo;
