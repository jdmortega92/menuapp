-- =====================================================================
-- CIERRE A - RLS multi-tenant: cierra escrituras y lecturas cross-tenant
-- Fecha: 2026-10-20  |  Primer SQL versionado del repo.
--
-- COMO CORRERLO: en el Supabase SQL Editor, UNA SECCION A LA VEZ
-- (seleccionar solo el bloque entre banners y ejecutar). El editor
-- muestra solo el resultado del ultimo statement; cada seccion es
-- independiente y deja la base consistente si se corta a la mitad.
--
-- Orden: 0 -> 1 -> 2 -> 3a -> 3b -> 4.  La 5 es solo emergencia.
--
-- Fuera de alcance (NO se tocan): SELECT publicos de las tablas del menu,
-- INSERT publicos de calificaciones/pedidos_whatsapp/visitas_menu/
-- vistas_platos/escaneos (ID-5), restaurantes, politicas duplicadas,
-- suscripciones, datos_facturacion.
--
-- Patron de propiedad (el mismo de "Platos propios" / "Config propia"):
--   restaurante_id IN (SELECT r.id FROM public.restaurantes r
--                      WHERE r.usuario_id = (SELECT auth.uid()))
-- =====================================================================


-- =====================================================================
-- SECCION 0 - PRE-CHECK (solo lectura)
-- Comparar con la lista de politicas amplias del brief ANTES de seguir.
-- Guardar este resultado: es el registro autoritativo para la Seccion 5.
-- rls_on debe ser true en las 11 tablas (si no, las politicas no aplican).
-- =====================================================================
SELECT t.tablename,
       c.relrowsecurity AS rls_on,
       p.policyname,
       p.cmd,
       p.roles,
       p.qual,
       p.with_check
FROM unnest(ARRAY[
       'horarios','plato_del_dia','combos','combo_platos','promos','promo_platos',
       'pedidos_whatsapp','visitas_menu','vistas_platos','escaneos','referidos'
     ]) AS t(tablename)
LEFT JOIN pg_class c
       ON c.relname = t.tablename AND c.relnamespace = 'public'::regnamespace
LEFT JOIN pg_policies p
       ON p.schemaname = 'public' AND p.tablename = t.tablename
ORDER BY t.tablename, p.cmd, p.policyname;


-- =====================================================================
-- SECCION 1 - PROBE (rollback garantizado)
-- Termina SIEMPRE en RAISE EXCEPTION: todo el bloque se revierte.
-- Sin DELETE ni INSERT. Los UPDATE son no-op (columna = si misma).
--
-- Esperado ANTES del fix: M > 0 donde A tenga filas.
-- Esperado DESPUES del fix: M = 0 en todas.
--
-- LIMITE CONOCIDO: combo_platos y promo_platos no tenian politica UPDATE
-- amplia (solo INSERT/DELETE), asi que su UPDATE da M = 0 tambien ANTES
-- del fix. Su hueco real es INSERT/DELETE, que el probe no ejercita por
-- regla; la Seccion 3b los cubre estructuralmente.
-- =====================================================================
DO $probe$
DECLARE
  v_n_rest  int;
  v_a       uuid;
  v_b       uuid;
  v_b_rests uuid[];
  v_combos  uuid[];
  v_promos  uuid[];
  a_hor int; a_pdd int; a_com int; a_pro int; a_cp int; a_pp int; a_ref_u int;
  a_ped int; a_vis int; a_vpl int; a_esc int; a_ref_s int;
  m_hor int; m_pdd int; m_com int; m_pro int; m_cp int; m_pp int; m_ref_u int;
  m_ped int; m_vis int; m_vpl int; m_esc int; m_ref_s int;
BEGIN
  -- ---- como postgres: elegir A y B -------------------------------------
  SELECT count(*) INTO v_n_rest FROM public.restaurantes;
  IF v_n_rest < 2 THEN
    RAISE EXCEPTION 'PROBE: se necesitan al menos 2 restaurantes, hay %', v_n_rest;
  END IF;

  SELECT r.id INTO v_a
  FROM public.restaurantes r
  ORDER BY
      (SELECT count(*) FROM public.horarios         x WHERE x.restaurante_id = r.id)
    + (SELECT count(*) FROM public.plato_del_dia    x WHERE x.restaurante_id = r.id)
    + (SELECT count(*) FROM public.combos           x WHERE x.restaurante_id = r.id)
    + (SELECT count(*) FROM public.promos           x WHERE x.restaurante_id = r.id)
    + (SELECT count(*) FROM public.combo_platos cp
         JOIN public.combos c ON c.id = cp.combo_id WHERE c.restaurante_id = r.id)
    + (SELECT count(*) FROM public.promo_platos pp
         JOIN public.promos p ON p.id = pp.promo_id WHERE p.restaurante_id = r.id)
    + (SELECT count(*) FROM public.pedidos_whatsapp x WHERE x.restaurante_id = r.id)
    + (SELECT count(*) FROM public.visitas_menu     x WHERE x.restaurante_id = r.id)
    + (SELECT count(*) FROM public.vistas_platos    x WHERE x.restaurante_id = r.id)
    + (SELECT count(*) FROM public.escaneos         x WHERE x.restaurante_id = r.id)
    + (SELECT count(*) FROM public.referidos        x
         WHERE x.referidor_id = r.id OR x.referido_id = r.id)
    DESC, r.id
  LIMIT 1;

  SELECT r.usuario_id INTO v_b
  FROM public.restaurantes r
  WHERE r.id <> v_a
    AND r.usuario_id IS NOT NULL
    AND r.usuario_id IS DISTINCT FROM (SELECT usuario_id FROM public.restaurantes WHERE id = v_a)
  ORDER BY r.id
  LIMIT 1;
  IF v_b IS NULL THEN
    RAISE EXCEPTION 'PROBE: no hay un segundo restaurante con un dueno distinto al de A';
  END IF;

  -- Restaurantes de B: se excluyen de referidos para no contar como fuga
  -- una fila A<->B que B SI puede ver legitimamente despues del fix.
  SELECT coalesce(array_agg(id), '{}') INTO v_b_rests FROM public.restaurantes WHERE usuario_id = v_b;
  -- Ids de combos/promos de A capturados como postgres, para que el probe
  -- de las junctions no dependa de la visibilidad de combos/promos para B.
  SELECT coalesce(array_agg(id), '{}') INTO v_combos FROM public.combos WHERE restaurante_id = v_a;
  SELECT coalesce(array_agg(id), '{}') INTO v_promos FROM public.promos WHERE restaurante_id = v_a;

  -- ---- como postgres: lo que A tiene ------------------------------------
  SELECT count(*) INTO a_hor FROM public.horarios         WHERE restaurante_id = v_a;
  SELECT count(*) INTO a_pdd FROM public.plato_del_dia    WHERE restaurante_id = v_a;
  SELECT count(*) INTO a_com FROM public.combos           WHERE restaurante_id = v_a;
  SELECT count(*) INTO a_pro FROM public.promos           WHERE restaurante_id = v_a;
  SELECT count(*) INTO a_cp  FROM public.combo_platos     WHERE combo_id = ANY (v_combos);
  SELECT count(*) INTO a_pp  FROM public.promo_platos     WHERE promo_id = ANY (v_promos);
  SELECT count(*) INTO a_ped FROM public.pedidos_whatsapp WHERE restaurante_id = v_a;
  SELECT count(*) INTO a_vis FROM public.visitas_menu     WHERE restaurante_id = v_a;
  SELECT count(*) INTO a_vpl FROM public.vistas_platos    WHERE restaurante_id = v_a;
  SELECT count(*) INTO a_esc FROM public.escaneos         WHERE restaurante_id = v_a;
  SELECT count(*) INTO a_ref_u FROM public.referidos
   WHERE (referidor_id = v_a OR referido_id = v_a)
     AND NOT coalesce(referidor_id = ANY (v_b_rests), false)
     AND NOT coalesce(referido_id  = ANY (v_b_rests), false);
  a_ref_s := a_ref_u;

  -- ---- impersonar a B ---------------------------------------------------
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_b, 'role', 'authenticated')::text,
                     true);
  SET LOCAL ROLE authenticated;

  -- ---- escrituras: UPDATE no-op sobre filas de A ------------------------
  UPDATE public.horarios      SET cerrado  = cerrado  WHERE restaurante_id = v_a;
  GET DIAGNOSTICS m_hor = ROW_COUNT;
  UPDATE public.plato_del_dia SET activo   = activo   WHERE restaurante_id = v_a;
  GET DIAGNOSTICS m_pdd = ROW_COUNT;
  UPDATE public.combos        SET activo   = activo   WHERE restaurante_id = v_a;
  GET DIAGNOSTICS m_com = ROW_COUNT;
  UPDATE public.promos        SET activo   = activo   WHERE restaurante_id = v_a;
  GET DIAGNOSTICS m_pro = ROW_COUNT;
  UPDATE public.combo_platos  SET plato_id = plato_id WHERE combo_id = ANY (v_combos);
  GET DIAGNOSTICS m_cp = ROW_COUNT;
  UPDATE public.promo_platos  SET plato_id = plato_id WHERE promo_id = ANY (v_promos);
  GET DIAGNOSTICS m_pp = ROW_COUNT;
  UPDATE public.referidos     SET estado   = estado
   WHERE (referidor_id = v_a OR referido_id = v_a)
     AND NOT coalesce(referidor_id = ANY (v_b_rests), false)
     AND NOT coalesce(referido_id  = ANY (v_b_rests), false);
  GET DIAGNOSTICS m_ref_u = ROW_COUNT;

  -- ---- lecturas: filas de A visibles para B -----------------------------
  SELECT count(*) INTO m_ped FROM public.pedidos_whatsapp WHERE restaurante_id = v_a;
  SELECT count(*) INTO m_vis FROM public.visitas_menu     WHERE restaurante_id = v_a;
  SELECT count(*) INTO m_vpl FROM public.vistas_platos    WHERE restaurante_id = v_a;
  SELECT count(*) INTO m_esc FROM public.escaneos         WHERE restaurante_id = v_a;
  SELECT count(*) INTO m_ref_s FROM public.referidos
   WHERE (referidor_id = v_a OR referido_id = v_a)
     AND NOT coalesce(referidor_id = ANY (v_b_rests), false)
     AND NOT coalesce(referido_id  = ANY (v_b_rests), false);

  -- ---- reporte + rollback -----------------------------------------------
  RAISE EXCEPTION '%', format(
    E'PROBE (rollback garantizado) A=%s B(usuario)=%s\n'
    'horarios UPDATE: A has %s, B touched %s\n'
    'plato_del_dia UPDATE: A has %s, B touched %s\n'
    'combos UPDATE: A has %s, B touched %s\n'
    'promos UPDATE: A has %s, B touched %s\n'
    'combo_platos UPDATE: A has %s, B touched %s\n'
    'promo_platos UPDATE: A has %s, B touched %s\n'
    'referidos UPDATE: A has %s, B touched %s\n'
    'pedidos_whatsapp SELECT: A has %s, B touched %s\n'
    'visitas_menu SELECT: A has %s, B touched %s\n'
    'vistas_platos SELECT: A has %s, B touched %s\n'
    'escaneos SELECT: A has %s, B touched %s\n'
    'referidos SELECT: A has %s, B touched %s',
    v_a, v_b,
    a_hor, m_hor, a_pdd, m_pdd, a_com, m_com, a_pro, m_pro,
    a_cp, m_cp, a_pp, m_pp, a_ref_u, m_ref_u,
    a_ped, m_ped, a_vis, m_vis, a_vpl, m_vpl, a_esc, m_esc, a_ref_s, m_ref_s);
END
$probe$;


-- =====================================================================
-- SECCION 2 - FIX (todo o nada)
-- Idempotente: si se corta, se puede volver a correr completa.
-- =====================================================================
BEGIN;

-- ---- 2.1 drop de las politicas amplias (nombres exactos) ---------------
DROP POLICY IF EXISTS "horarios_insertar_autenticado"      ON public.horarios;
DROP POLICY IF EXISTS "horarios_actualizar_autenticado"    ON public.horarios;
DROP POLICY IF EXISTS "horarios_borrar_autenticado"        ON public.horarios;

DROP POLICY IF EXISTS "plato_del_dia_insertar_autenticado"   ON public.plato_del_dia;
DROP POLICY IF EXISTS "plato_del_dia_actualizar_autenticado" ON public.plato_del_dia;
DROP POLICY IF EXISTS "plato_del_dia_borrar_autenticado"     ON public.plato_del_dia;

DROP POLICY IF EXISTS "combos_insertar_autenticado"        ON public.combos;
DROP POLICY IF EXISTS "combos_actualizar_autenticado"      ON public.combos;
DROP POLICY IF EXISTS "combos_borrar_autenticado"          ON public.combos;

DROP POLICY IF EXISTS "promos_insertar_autenticado"        ON public.promos;
DROP POLICY IF EXISTS "promos_actualizar_autenticado"      ON public.promos;
DROP POLICY IF EXISTS "promos_borrar_autenticado"          ON public.promos;

DROP POLICY IF EXISTS "combo_platos_insertar_autenticado"  ON public.combo_platos;
DROP POLICY IF EXISTS "combo_platos_borrar_autenticado"    ON public.combo_platos;

DROP POLICY IF EXISTS "promo_platos_insertar_autenticado"  ON public.promo_platos;
DROP POLICY IF EXISTS "promo_platos_borrar_autenticado"    ON public.promo_platos;

DROP POLICY IF EXISTS "pedidos_whatsapp_lectura_autenticado" ON public.pedidos_whatsapp;
DROP POLICY IF EXISTS "visitas_menu_lectura_autenticado"     ON public.visitas_menu;
DROP POLICY IF EXISTS "vistas_platos_lectura_autenticado"    ON public.vistas_platos;
DROP POLICY IF EXISTS "escaneos_lectura_autenticado"         ON public.escaneos;

DROP POLICY IF EXISTS "Insert público referidos"     ON public.referidos;
DROP POLICY IF EXISTS "Lectura pública referidos"    ON public.referidos;
DROP POLICY IF EXISTS "Update autenticado referidos" ON public.referidos;

-- ---- 2.2 drop de las nuevas (permite re-correr la seccion) -------------
DROP POLICY IF EXISTS horarios_propios                ON public.horarios;
DROP POLICY IF EXISTS plato_del_dia_propios           ON public.plato_del_dia;
DROP POLICY IF EXISTS combos_propios                  ON public.combos;
DROP POLICY IF EXISTS promos_propios                  ON public.promos;
DROP POLICY IF EXISTS combo_platos_propios            ON public.combo_platos;
DROP POLICY IF EXISTS promo_platos_propios            ON public.promo_platos;
DROP POLICY IF EXISTS pedidos_whatsapp_lectura_propia ON public.pedidos_whatsapp;
DROP POLICY IF EXISTS visitas_menu_lectura_propia     ON public.visitas_menu;
DROP POLICY IF EXISTS vistas_platos_lectura_propia    ON public.vistas_platos;
DROP POLICY IF EXISTS escaneos_lectura_propia         ON public.escaneos;
DROP POLICY IF EXISTS referidos_lectura_propia        ON public.referidos;

-- ---- 2.3 tablas con restaurante_id: FOR ALL del dueno ------------------
CREATE POLICY horarios_propios ON public.horarios
  FOR ALL TO authenticated
  USING      (restaurante_id IN (SELECT r.id FROM public.restaurantes r WHERE r.usuario_id = (SELECT auth.uid())))
  WITH CHECK (restaurante_id IN (SELECT r.id FROM public.restaurantes r WHERE r.usuario_id = (SELECT auth.uid())));

CREATE POLICY combos_propios ON public.combos
  FOR ALL TO authenticated
  USING      (restaurante_id IN (SELECT r.id FROM public.restaurantes r WHERE r.usuario_id = (SELECT auth.uid())))
  WITH CHECK (restaurante_id IN (SELECT r.id FROM public.restaurantes r WHERE r.usuario_id = (SELECT auth.uid())));

CREATE POLICY promos_propios ON public.promos
  FOR ALL TO authenticated
  USING      (restaurante_id IN (SELECT r.id FROM public.restaurantes r WHERE r.usuario_id = (SELECT auth.uid())))
  WITH CHECK (restaurante_id IN (SELECT r.id FROM public.restaurantes r WHERE r.usuario_id = (SELECT auth.uid())));

-- plato_del_dia: ademas el plato es del dueno y la variante es de ese plato.
-- Las referencias a la fila van calificadas (plato_del_dia.x): dentro del
-- subquery de plato_variantes un plato_id sin calificar resolveria a v.plato_id.
CREATE POLICY plato_del_dia_propios ON public.plato_del_dia
  FOR ALL TO authenticated
  USING (restaurante_id IN (SELECT r.id FROM public.restaurantes r WHERE r.usuario_id = (SELECT auth.uid())))
  WITH CHECK (
        plato_del_dia.restaurante_id IN (SELECT r.id FROM public.restaurantes r WHERE r.usuario_id = (SELECT auth.uid()))
    AND plato_del_dia.plato_id IN (
          SELECT p.id FROM public.platos p
          WHERE p.restaurante_id IN (SELECT r.id FROM public.restaurantes r WHERE r.usuario_id = (SELECT auth.uid())))
    AND (plato_del_dia.variante_id IS NULL
         OR EXISTS (SELECT 1 FROM public.plato_variantes v
                    WHERE v.id = plato_del_dia.variante_id
                      AND v.plato_id = plato_del_dia.plato_id))
  );

-- ---- 2.4 junctions: el padre es del dueno; al escribir, plato y variante tambien
CREATE POLICY combo_platos_propios ON public.combo_platos
  FOR ALL TO authenticated
  USING (
    combo_platos.combo_id IN (
      SELECT c.id FROM public.combos c
      WHERE c.restaurante_id IN (SELECT r.id FROM public.restaurantes r WHERE r.usuario_id = (SELECT auth.uid())))
  )
  WITH CHECK (
        combo_platos.combo_id IN (
          SELECT c.id FROM public.combos c
          WHERE c.restaurante_id IN (SELECT r.id FROM public.restaurantes r WHERE r.usuario_id = (SELECT auth.uid())))
    AND combo_platos.plato_id IN (
          SELECT p.id FROM public.platos p
          WHERE p.restaurante_id IN (SELECT r.id FROM public.restaurantes r WHERE r.usuario_id = (SELECT auth.uid())))
    AND (combo_platos.variante_id IS NULL
         OR EXISTS (SELECT 1 FROM public.plato_variantes v
                    WHERE v.id = combo_platos.variante_id
                      AND v.plato_id = combo_platos.plato_id))
  );

CREATE POLICY promo_platos_propios ON public.promo_platos
  FOR ALL TO authenticated
  USING (
    promo_platos.promo_id IN (
      SELECT pr.id FROM public.promos pr
      WHERE pr.restaurante_id IN (SELECT r.id FROM public.restaurantes r WHERE r.usuario_id = (SELECT auth.uid())))
  )
  WITH CHECK (
        promo_platos.promo_id IN (
          SELECT pr.id FROM public.promos pr
          WHERE pr.restaurante_id IN (SELECT r.id FROM public.restaurantes r WHERE r.usuario_id = (SELECT auth.uid())))
    AND promo_platos.plato_id IN (
          SELECT p.id FROM public.platos p
          WHERE p.restaurante_id IN (SELECT r.id FROM public.restaurantes r WHERE r.usuario_id = (SELECT auth.uid())))
    AND (promo_platos.variante_id IS NULL
         OR EXISTS (SELECT 1 FROM public.plato_variantes v
                    WHERE v.id = promo_platos.variante_id
                      AND v.plato_id = promo_platos.plato_id))
  );

-- ---- 2.5 analitica: lectura solo del restaurante propio ----------------
CREATE POLICY pedidos_whatsapp_lectura_propia ON public.pedidos_whatsapp
  FOR SELECT TO authenticated
  USING (restaurante_id IN (SELECT r.id FROM public.restaurantes r WHERE r.usuario_id = (SELECT auth.uid())));

CREATE POLICY visitas_menu_lectura_propia ON public.visitas_menu
  FOR SELECT TO authenticated
  USING (restaurante_id IN (SELECT r.id FROM public.restaurantes r WHERE r.usuario_id = (SELECT auth.uid())));

CREATE POLICY vistas_platos_lectura_propia ON public.vistas_platos
  FOR SELECT TO authenticated
  USING (restaurante_id IN (SELECT r.id FROM public.restaurantes r WHERE r.usuario_id = (SELECT auth.uid())));

CREATE POLICY escaneos_lectura_propia ON public.escaneos
  FOR SELECT TO authenticated
  USING (restaurante_id IN (SELECT r.id FROM public.restaurantes r WHERE r.usuario_id = (SELECT auth.uid())));

-- ---- 2.6 referidos: lectura si el dueno es referidor O referido; sin escritura
CREATE POLICY referidos_lectura_propia ON public.referidos
  FOR SELECT TO authenticated
  USING (
       referidor_id IN (SELECT r.id FROM public.restaurantes r WHERE r.usuario_id = (SELECT auth.uid()))
    OR referido_id  IN (SELECT r.id FROM public.restaurantes r WHERE r.usuario_id = (SELECT auth.uid()))
  );

COMMIT;


-- =====================================================================
-- SECCION 3a - POST-CHECK: politicas resultantes (solo lectura)
-- =====================================================================
SELECT t.tablename,
       c.relrowsecurity AS rls_on,
       p.policyname,
       p.cmd,
       p.roles,
       p.qual,
       p.with_check
FROM unnest(ARRAY[
       'horarios','plato_del_dia','combos','combo_platos','promos','promo_platos',
       'pedidos_whatsapp','visitas_menu','vistas_platos','escaneos','referidos'
     ]) AS t(tablename)
LEFT JOIN pg_class c
       ON c.relname = t.tablename AND c.relnamespace = 'public'::regnamespace
LEFT JOIN pg_policies p
       ON p.schemaname = 'public' AND p.tablename = t.tablename
ORDER BY t.tablename, p.cmd, p.policyname;


-- =====================================================================
-- SECCION 3b - POST-CHECK: WHITELIST, DEBE DEVOLVER CERO FILAS (solo lectura)
-- El SELECT publico de las seis tablas de contenido y el INSERT publico de
-- las cuatro tablas de analitica quedan fuera de alcance a proposito (ID-5);
-- cualquier otra politica en estas 11 tablas debe ser una de las 11 nuevas.
-- Es whitelist y no blacklist: atrapa politicas amplias escritas de otra
-- forma (p.ej. USING (auth.uid() IS NOT NULL)) y las que no salieron en
-- las capturas del brief.
-- =====================================================================
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (
        (tablename IN ('horarios','plato_del_dia','combos','promos','combo_platos','promo_platos')
         AND cmd <> 'SELECT'
         AND policyname <> tablename || '_propios')
     OR (tablename IN ('pedidos_whatsapp','visitas_menu','vistas_platos','escaneos')
         AND cmd <> 'INSERT'
         AND policyname <> tablename || '_lectura_propia')
     OR (tablename = 'referidos'
         AND policyname <> 'referidos_lectura_propia')
      )
ORDER BY tablename, policyname;


-- =====================================================================
-- SECCION 4 - PROBE DESPUES
-- Volver a correr la SECCION 1 tal cual. Esperado: "B touched 0" en todas.
-- =====================================================================


-- =====================================================================
-- SECCION 5 - ROLLBACK (SOLO EMERGENCIA, todo comentado)
-- ATENCION: reconstruido desde la descripcion del brief (roles {public},
-- auth.role() = 'authenticated'). Antes de usarlo, compararlo linea a
-- linea con el resultado guardado de la SECCION 0 y corregir cualquier
-- diferencia (p.ej. un with_check en los UPDATE originales).
-- Re-abre los huecos cross-tenant: usar solo si el fix rompe produccion.
-- =====================================================================
-- BEGIN;
--
-- DROP POLICY IF EXISTS horarios_propios                ON public.horarios;
-- DROP POLICY IF EXISTS plato_del_dia_propios           ON public.plato_del_dia;
-- DROP POLICY IF EXISTS combos_propios                  ON public.combos;
-- DROP POLICY IF EXISTS promos_propios                  ON public.promos;
-- DROP POLICY IF EXISTS combo_platos_propios            ON public.combo_platos;
-- DROP POLICY IF EXISTS promo_platos_propios            ON public.promo_platos;
-- DROP POLICY IF EXISTS pedidos_whatsapp_lectura_propia ON public.pedidos_whatsapp;
-- DROP POLICY IF EXISTS visitas_menu_lectura_propia     ON public.visitas_menu;
-- DROP POLICY IF EXISTS vistas_platos_lectura_propia    ON public.vistas_platos;
-- DROP POLICY IF EXISTS escaneos_lectura_propia         ON public.escaneos;
-- DROP POLICY IF EXISTS referidos_lectura_propia        ON public.referidos;
--
-- CREATE POLICY "horarios_insertar_autenticado"   ON public.horarios FOR INSERT TO public WITH CHECK (auth.role() = 'authenticated');
-- CREATE POLICY "horarios_actualizar_autenticado" ON public.horarios FOR UPDATE TO public USING (auth.role() = 'authenticated');
-- CREATE POLICY "horarios_borrar_autenticado"     ON public.horarios FOR DELETE TO public USING (auth.role() = 'authenticated');
--
-- CREATE POLICY "plato_del_dia_insertar_autenticado"   ON public.plato_del_dia FOR INSERT TO public WITH CHECK (auth.role() = 'authenticated');
-- CREATE POLICY "plato_del_dia_actualizar_autenticado" ON public.plato_del_dia FOR UPDATE TO public USING (auth.role() = 'authenticated');
-- CREATE POLICY "plato_del_dia_borrar_autenticado"     ON public.plato_del_dia FOR DELETE TO public USING (auth.role() = 'authenticated');
--
-- CREATE POLICY "combos_insertar_autenticado"   ON public.combos FOR INSERT TO public WITH CHECK (auth.role() = 'authenticated');
-- CREATE POLICY "combos_actualizar_autenticado" ON public.combos FOR UPDATE TO public USING (auth.role() = 'authenticated');
-- CREATE POLICY "combos_borrar_autenticado"     ON public.combos FOR DELETE TO public USING (auth.role() = 'authenticated');
--
-- CREATE POLICY "promos_insertar_autenticado"   ON public.promos FOR INSERT TO public WITH CHECK (auth.role() = 'authenticated');
-- CREATE POLICY "promos_actualizar_autenticado" ON public.promos FOR UPDATE TO public USING (auth.role() = 'authenticated');
-- CREATE POLICY "promos_borrar_autenticado"     ON public.promos FOR DELETE TO public USING (auth.role() = 'authenticated');
--
-- CREATE POLICY "combo_platos_insertar_autenticado" ON public.combo_platos FOR INSERT TO public WITH CHECK (auth.role() = 'authenticated');
-- CREATE POLICY "combo_platos_borrar_autenticado"   ON public.combo_platos FOR DELETE TO public USING (auth.role() = 'authenticated');
--
-- CREATE POLICY "promo_platos_insertar_autenticado" ON public.promo_platos FOR INSERT TO public WITH CHECK (auth.role() = 'authenticated');
-- CREATE POLICY "promo_platos_borrar_autenticado"   ON public.promo_platos FOR DELETE TO public USING (auth.role() = 'authenticated');
--
-- CREATE POLICY "pedidos_whatsapp_lectura_autenticado" ON public.pedidos_whatsapp FOR SELECT TO public USING (auth.role() = 'authenticated');
-- CREATE POLICY "visitas_menu_lectura_autenticado"     ON public.visitas_menu     FOR SELECT TO public USING (auth.role() = 'authenticated');
-- CREATE POLICY "vistas_platos_lectura_autenticado"    ON public.vistas_platos    FOR SELECT TO public USING (auth.role() = 'authenticated');
-- CREATE POLICY "escaneos_lectura_autenticado"         ON public.escaneos         FOR SELECT TO public USING (auth.role() = 'authenticated');
--
-- CREATE POLICY "Insert público referidos"     ON public.referidos FOR INSERT TO public WITH CHECK (true);
-- CREATE POLICY "Lectura pública referidos"    ON public.referidos FOR SELECT TO public USING (true);
-- CREATE POLICY "Update autenticado referidos" ON public.referidos FOR UPDATE TO public USING ((SELECT auth.uid()) IS NOT NULL);
--
-- COMMIT;
