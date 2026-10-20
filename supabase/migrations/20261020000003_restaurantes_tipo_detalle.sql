-- =====================================================================
-- CIERRE P1 - restaurantes.tipo_detalle (texto libre del tipo 'otro')
-- Fecha: 2026-10-20  |  Convenciones de 20261020000000..0002.
--
-- COMO CORRERLO: en el Supabase SQL Editor, UNA SECCION A LA VEZ.
-- Orden: 0a -> 0b -> 1 -> 2 -> 3.  La 4 es solo emergencia.
--
-- ORDEN DE DESPLIEGUE: esta migracion va ANTES de cualquier deploy (y antes
-- del smoke local). /registro y /completa-perfil mandan tipo_detalle en el
-- INSERT y /config en el UPDATE: sin la columna, el ALTA falla.
--
-- REGLA AUD-2: columna nueva escrita desde el navegador = GRANT de columna
-- explicito. Sin el, la escritura falla con 42501 y la UI dice "Guardado".
-- =====================================================================


-- =====================================================================
-- SECCION 0a - PRE-CHECK: la columna NO existe (esperado: cero filas)
-- =====================================================================
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'restaurantes' AND column_name = 'tipo_detalle';


-- =====================================================================
-- SECCION 0b - PRE-CHECK: CHECK constraints actuales de restaurantes
-- (informativo: muestra si existe alguna restriccion sobre tipo)
-- =====================================================================
SELECT conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'public.restaurantes'::regclass AND contype = 'c'
ORDER BY conname;


-- =====================================================================
-- SECCION 1 - FIX (todo o nada, re-ejecutable)
-- =====================================================================
BEGIN;

ALTER TABLE public.restaurantes ADD COLUMN IF NOT EXISTS tipo_detalle text;

ALTER TABLE public.restaurantes DROP CONSTRAINT IF EXISTS restaurantes_tipo_detalle_largo;
ALTER TABLE public.restaurantes ADD CONSTRAINT restaurantes_tipo_detalle_largo
  CHECK (tipo_detalle IS NULL OR char_length(btrim(tipo_detalle)) <= 40);

GRANT INSERT (tipo_detalle), UPDATE (tipo_detalle) ON public.restaurantes TO authenticated;

COMMIT;


-- =====================================================================
-- SECCION 2 - POST-CHECK (solo lectura)
-- Esperado: 1 fila; constraint presente; auth_insert/auth_update true;
-- anon_insert/anon_update false.
-- =====================================================================
SELECT c.column_name,
       c.data_type,
       c.is_nullable,
       (SELECT pg_get_constraintdef(oid) FROM pg_constraint
         WHERE conrelid = 'public.restaurantes'::regclass
           AND conname = 'restaurantes_tipo_detalle_largo') AS constraint_def,
       has_column_privilege('authenticated', 'public.restaurantes', 'tipo_detalle', 'INSERT') AS auth_insert,
       has_column_privilege('authenticated', 'public.restaurantes', 'tipo_detalle', 'UPDATE') AS auth_update,
       has_column_privilege('anon', 'public.restaurantes', 'tipo_detalle', 'INSERT') AS anon_insert,
       has_column_privilege('anon', 'public.restaurantes', 'tipo_detalle', 'UPDATE') AS anon_update
FROM information_schema.columns c
WHERE c.table_schema = 'public' AND c.table_name = 'restaurantes' AND c.column_name = 'tipo_detalle';


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
  r_a text; r_b text;
BEGIN
  SELECT usuario_id INTO v_owner FROM public.restaurantes WHERE id = v_id;
  IF NOT FOUND OR v_owner IS NULL THEN
    RAISE EXCEPTION 'PROBE: no existe el restaurante % o no tiene usuario_id', v_id;
  END IF;

  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_owner, 'role', 'authenticated')::text,
                     true);
  SET LOCAL ROLE authenticated;

  -- a. el dueno escribe su propio tipo_detalle -> OK rows=1
  BEGIN
    UPDATE public.restaurantes SET tipo_detalle = 'Floristeria' WHERE id = v_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    r_a := 'OK rows=' || v_rows;
  EXCEPTION WHEN OTHERS THEN
    r_a := SQLSTATE;
  END;

  -- b. 41 caracteres -> 23514 (CHECK)
  BEGIN
    UPDATE public.restaurantes SET tipo_detalle = repeat('x', 41) WHERE id = v_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    r_b := 'OK rows=' || v_rows;
  EXCEPTION WHEN OTHERS THEN
    r_b := SQLSTATE;
  END;

  RAISE EXCEPTION '%', format(
    E'PROBE (rollback garantizado) restaurante=%s dueno=%s\n'
    'a. UPDATE tipo_detalle propio: expected OK rows=1, got %s\n'
    'b. UPDATE 41 caracteres:       expected 23514,     got %s',
    v_id, v_owner, r_a, r_b);
END
$probe$;


-- =====================================================================
-- SECCION 4 - ROLLBACK (SOLO EMERGENCIA, todo comentado)
-- OJO: el codigo desplegado LEE y ESCRIBE tipo_detalle. Borrar la columna
-- sin revertir el codigo ROMPE EL ALTA (/registro y /completa-perfil la
-- mandan en el INSERT) y hace fallar el guardado de /config.
-- DROP COLUMN se lleva tambien el CHECK y los grants de la columna.
-- =====================================================================
-- ALTER TABLE public.restaurantes DROP COLUMN IF EXISTS tipo_detalle;
