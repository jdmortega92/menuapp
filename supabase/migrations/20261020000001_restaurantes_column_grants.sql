-- =====================================================================
-- CIERRE 2 - Privilegios por columna en restaurantes + constraints de integridad
-- Fecha: 2026-10-20  |  Sigue las convenciones de 20261020000000_rls_multitenant.sql
--
-- COMO CORRERLO: en el Supabase SQL Editor, UNA SECCION A LA VEZ
-- (seleccionar solo el bloque entre banners y ejecutar). El editor
-- muestra solo el resultado del ultimo statement.
--
-- Orden: 0 -> 1 -> 2a -> 2b -> 3.  La 4 es solo emergencia.
--
-- POR QUE: la politica "Restaurante propio" (FOR ALL, usuario_id = auth.uid())
-- mas los grants de tabla dejaban al dueno escribir CUALQUIER columna de su
-- fila, incluidas las 8 de facturacion (plan, periodo_plan, plan_expira,
-- fue_pago, plan_programado, fecha_cambio_programado, cobro_automatico,
-- cobro_automatico_desde). RLS es por fila, no por columna. Desde CIERRE 1
-- (652df8b) ningun codigo de navegador las escribe; las rutas de servidor usan
-- el cliente admin (service role), al que estos grants no afectan.
--
-- Mecanica de Postgres: un REVOKE de columna no hace nada mientras exista el
-- grant de TABLA. Por eso se revoca INSERT/UPDATE de tabla y se otorgan listas
-- explicitas de columnas. El REVOKE de tabla tambien borra cualquier grant de
-- columna previo del mismo tipo, asi que re-correr la Seccion 1 deja
-- EXACTAMENTE las listas de abajo.
--
-- SELECT y DELETE NO se tocan.
-- =====================================================================


-- =====================================================================
-- SECCION 0 - PRE-CHECK (solo lectura)
-- Columnas reales de restaurantes y privilegios efectivos HOY. Esperado
-- antes del fix: true en las cuatro columnas de privilegio para todo.
-- Revisar tambien is_nullable / column_default de las 7 columnas del INSERT.
-- =====================================================================
SELECT c.ordinal_position,
       c.column_name,
       c.data_type,
       c.is_nullable,
       c.column_default,
       has_column_privilege('authenticated', 'public.restaurantes', c.column_name, 'INSERT') AS auth_insert,
       has_column_privilege('authenticated', 'public.restaurantes', c.column_name, 'UPDATE') AS auth_update,
       has_column_privilege('anon',          'public.restaurantes', c.column_name, 'INSERT') AS anon_insert,
       has_column_privilege('anon',          'public.restaurantes', c.column_name, 'UPDATE') AS anon_update
FROM information_schema.columns c
WHERE c.table_schema = 'public' AND c.table_name = 'restaurantes'
ORDER BY c.ordinal_position;


-- =====================================================================
-- SECCION 1 - FIX (todo o nada, re-ejecutable)
-- =====================================================================
BEGIN;

-- ---- 1.1 privilegios ----------------------------------------------------
REVOKE INSERT, UPDATE ON public.restaurantes FROM anon, authenticated;

-- INSERT: lo que mandan los dos flujos de alta. Nada de facturacion: plan
-- toma su default 'gratis' de la DB (CIERRE 1 quito plan de ambos payloads).
GRANT INSERT (
  usuario_id,   -- src/app/registro/page.tsx:66, src/app/completa-perfil/page.tsx:74
  nombre,       -- registro/page.tsx:67, completa-perfil/page.tsx:75
  tipo,         -- registro/page.tsx:68, completa-perfil/page.tsx:76
  ciudad,       -- registro/page.tsx:69, completa-perfil/page.tsx:77
  whatsapp,     -- registro/page.tsx:70, completa-perfil/page.tsx:78
  slug,         -- registro/page.tsx:71, completa-perfil/page.tsx:79
  idioma        -- registro/page.tsx:74, completa-perfil/page.tsx:82
) ON public.restaurantes TO authenticated;

-- UPDATE: union exacta de lo que escribe hoy algun camino no-admin.
-- Ni id ni usuario_id ni slug: ningun camino los actualiza.
GRANT UPDATE (
  logo_url,             -- src/app/config/page.tsx:260
  banner_url,           -- src/app/config/page.tsx:263
  nombre,               -- src/app/config/page.tsx:394
  tipo,                 -- src/app/config/page.tsx:394
  ciudad,               -- src/app/config/page.tsx:394
  whatsapp,             -- src/app/config/page.tsx:394
  direccion,            -- src/app/config/page.tsx:394
  descripcion,          -- src/app/config/page.tsx:394
  color_principal,      -- src/app/config/page.tsx:395
  tema,                 -- src/app/config/page.tsx:395
  menu_compartido,      -- src/app/qr/page.tsx:44
  qr_generado,          -- src/app/qr/page.tsx:70
  codigo_referido,      -- src/app/referidos/page.tsx:47
  onboarding_cerrado,   -- src/hooks/useOnboardingStatus.ts:309
  bienvenida_enviada    -- src/app/api/emails/route.ts:97 (cliente de SESION, no admin)
) ON public.restaurantes TO authenticated;

-- anon no recibe nada: ningun camino anonimo escribe restaurantes.

-- ---- 1.2 integridad -----------------------------------------------------
-- Un usuario, un restaurante. Las rutas leen por usuario_id con
-- .maybeSingle()/.single(): dos filas las rompen.
ALTER TABLE public.restaurantes DROP CONSTRAINT IF EXISTS restaurantes_usuario_id_key;
ALTER TABLE public.restaurantes ADD CONSTRAINT restaurantes_usuario_id_key UNIQUE (usuario_id);

ALTER TABLE public.restaurantes ALTER COLUMN plan SET NOT NULL;

ALTER TABLE public.restaurantes DROP CONSTRAINT IF EXISTS restaurantes_plan_valido;
ALTER TABLE public.restaurantes ADD CONSTRAINT restaurantes_plan_valido
  CHECK (plan IN ('gratis', 'basico', 'pro'));

ALTER TABLE public.restaurantes DROP CONSTRAINT IF EXISTS restaurantes_plan_programado_valido;
ALTER TABLE public.restaurantes ADD CONSTRAINT restaurantes_plan_programado_valido
  CHECK (plan_programado IS NULL OR plan_programado IN ('gratis', 'basico', 'pro'));

COMMIT;


-- =====================================================================
-- SECCION 2a - POST-CHECK: privilegios resultantes (solo lectura)
-- Esperado: las 8 de facturacion en false en las cuatro columnas; anon en
-- false en todo; authenticated true EXACTAMENTE en las listas de la Seccion 1.
-- =====================================================================
SELECT c.ordinal_position,
       c.column_name,
       c.data_type,
       c.is_nullable,
       c.column_default,
       has_column_privilege('authenticated', 'public.restaurantes', c.column_name, 'INSERT') AS auth_insert,
       has_column_privilege('authenticated', 'public.restaurantes', c.column_name, 'UPDATE') AS auth_update,
       has_column_privilege('anon',          'public.restaurantes', c.column_name, 'INSERT') AS anon_insert,
       has_column_privilege('anon',          'public.restaurantes', c.column_name, 'UPDATE') AS anon_update
FROM information_schema.columns c
WHERE c.table_schema = 'public' AND c.table_name = 'restaurantes'
ORDER BY c.ordinal_position;


-- =====================================================================
-- SECCION 2b - POST-CHECK: DEBE DEVOLVER CERO FILAS (solo lectura)
-- Cada fila es una columna cuyo privilegio efectivo difiere de las listas.
-- =====================================================================
WITH esperado AS (
  SELECT c.column_name,
         c.column_name IN ('usuario_id','nombre','tipo','ciudad','whatsapp','slug','idioma') AS ins,
         c.column_name IN ('logo_url','banner_url','nombre','tipo','ciudad','whatsapp','direccion',
                           'descripcion','color_principal','tema','menu_compartido','qr_generado',
                           'codigo_referido','onboarding_cerrado','bienvenida_enviada') AS upd
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'restaurantes'
)
SELECT e.column_name,
       e.ins AS esperado_auth_insert,
       has_column_privilege('authenticated', 'public.restaurantes', e.column_name, 'INSERT') AS auth_insert,
       e.upd AS esperado_auth_update,
       has_column_privilege('authenticated', 'public.restaurantes', e.column_name, 'UPDATE') AS auth_update,
       has_column_privilege('anon', 'public.restaurantes', e.column_name, 'INSERT') AS anon_insert,
       has_column_privilege('anon', 'public.restaurantes', e.column_name, 'UPDATE') AS anon_update
FROM esperado e
WHERE has_column_privilege('authenticated', 'public.restaurantes', e.column_name, 'INSERT') <> e.ins
   OR has_column_privilege('authenticated', 'public.restaurantes', e.column_name, 'UPDATE') <> e.upd
   OR has_column_privilege('anon', 'public.restaurantes', e.column_name, 'INSERT')
   OR has_column_privilege('anon', 'public.restaurantes', e.column_name, 'UPDATE')
ORDER BY e.column_name;


-- =====================================================================
-- SECCION 3 - PROBE (rollback garantizado)
-- Impersona al dueno del restaurante de prueba igual que el probe de CIERRE A.
-- Cada intento corre en su propio sub-bloque BEGIN ... EXCEPTION que guarda
-- el SQLSTATE. Termina SIEMPRE en RAISE EXCEPTION: nada queda escrito.
-- Los INSERT copian tipo/ciudad/... de la fila existente con INSERT ... SELECT
-- para no depender del tipo exacto de cada columna (p.ej. un enum).
-- =====================================================================
DO $probe$
DECLARE
  v_id      uuid := 'c8a8c0d2-5887-4dd2-a37a-266fe4b856bf';
  v_owner   uuid;
  v_slug    text := 'probe-cierre2-' || substr(md5(random()::text), 1, 8);
  v_rows    int;
  r_a text; r_b text; r_c text; r_d text; r_e text;
BEGIN
  -- ---- como postgres ----------------------------------------------------
  SELECT usuario_id INTO v_owner FROM public.restaurantes WHERE id = v_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROBE: no existe el restaurante %', v_id;
  END IF;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'PROBE: el restaurante % no tiene usuario_id', v_id;
  END IF;

  -- ---- impersonar al dueno ---------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_owner, 'role', 'authenticated')::text,
                     true);
  SET LOCAL ROLE authenticated;

  -- a. columna de facturacion: plan
  BEGIN
    UPDATE public.restaurantes SET plan = plan WHERE id = v_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    r_a := 'OK rows=' || v_rows;
  EXCEPTION WHEN OTHERS THEN
    r_a := SQLSTATE;
  END;

  -- b. columna de facturacion: fue_pago
  BEGIN
    UPDATE public.restaurantes SET fue_pago = fue_pago WHERE id = v_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    r_b := 'OK rows=' || v_rows;
  EXCEPTION WHEN OTHERS THEN
    r_b := SQLSTATE;
  END;

  -- c. columna otorgada: nombre
  BEGIN
    UPDATE public.restaurantes SET nombre = nombre WHERE id = v_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    r_c := 'OK rows=' || v_rows;
  EXCEPTION WHEN OTHERS THEN
    r_c := SQLSTATE;
  END;

  -- d. INSERT solo con columnas otorgadas, mismo usuario_id -> unique
  BEGIN
    INSERT INTO public.restaurantes (usuario_id, nombre, tipo, ciudad, whatsapp, slug, idioma)
    SELECT usuario_id, nombre, tipo, ciudad, whatsapp, v_slug, idioma
    FROM public.restaurantes WHERE id = v_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    r_d := 'OK rows=' || v_rows;
  EXCEPTION WHEN OTHERS THEN
    r_d := SQLSTATE;
  END;

  -- e. el mismo INSERT + plan = 'pro' -> privilegio de columna
  BEGIN
    INSERT INTO public.restaurantes (usuario_id, nombre, tipo, ciudad, whatsapp, slug, idioma, plan)
    SELECT usuario_id, nombre, tipo, ciudad, whatsapp, v_slug || '-e', idioma, 'pro'
    FROM public.restaurantes WHERE id = v_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    r_e := 'OK rows=' || v_rows;
  EXCEPTION WHEN OTHERS THEN
    r_e := SQLSTATE;
  END;

  RAISE EXCEPTION '%', format(
    E'PROBE (rollback garantizado) restaurante=%s dueno=%s\n'
    'a. UPDATE plan:              expected 42501,     got %s\n'
    'b. UPDATE fue_pago:          expected 42501,     got %s\n'
    'c. UPDATE nombre:            expected OK rows=1, got %s\n'
    'd. INSERT columnas otorgadas: expected 23505,    got %s\n'
    'e. INSERT + plan=pro:        expected 42501,     got %s',
    v_id, v_owner, r_a, r_b, r_c, r_d, r_e);
END
$probe$;


-- =====================================================================
-- SECCION 4 - ROLLBACK (SOLO EMERGENCIA, todo comentado)
-- Re-abre la escritura de las 8 columnas de facturacion desde el navegador.
-- El GRANT de tabla vuelve a cubrir todas las columnas; los grants de
-- columna de la Seccion 1 quedan pero no restringen nada.
-- =====================================================================
-- BEGIN;
--
-- GRANT INSERT, UPDATE ON public.restaurantes TO anon, authenticated;
--
-- ALTER TABLE public.restaurantes DROP CONSTRAINT IF EXISTS restaurantes_usuario_id_key;
-- ALTER TABLE public.restaurantes DROP CONSTRAINT IF EXISTS restaurantes_plan_valido;
-- ALTER TABLE public.restaurantes DROP CONSTRAINT IF EXISTS restaurantes_plan_programado_valido;
-- ALTER TABLE public.restaurantes ALTER COLUMN plan DROP NOT NULL;
--
-- COMMIT;
