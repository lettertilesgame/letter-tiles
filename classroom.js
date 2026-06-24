/* ============================================================
   classroom.js — gemeinsame Klassen-/Sync-Logik (Schüler + Lehrer)
   Nutzt den Supabase-Client (CDN) + supabase-config.js.

   Wird die App offline/ohne gültige Config geladen, bleibt
   Classroom.ready = false und alle Aufrufe sind harmlose No-ops,
   sodass das Spiel normal weiterläuft.
   ============================================================ */
(function () {
  'use strict';

  const cfg = window.SUPABASE_CONFIG || {};
  const hasCfg = !!(cfg.url && cfg.anonKey &&
                    !/DEIN-PROJEKT/.test(cfg.url) &&
                    !/DEIN-ANON/.test(cfg.anonKey));
  const sdk = window.supabase; // UMD global from @supabase/supabase-js
  const ready = !!(sdk && hasCfg);

  let client = null;
  if (ready) {
    try { client = sdk.createClient(cfg.url, cfg.anonKey); }
    catch (e) { client = null; }
  }

  const TABLE = 'lt_students';
  const LS_KEY = 'lt_classroom';
  const DEV_KEY = 'lt_device_id';

  function deviceId() {
    let id = null;
    try { id = localStorage.getItem(DEV_KEY); } catch (e) {}
    if (!id) {
      id = 'dev_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      try { localStorage.setItem(DEV_KEY, id); } catch (e) {}
    }
    return id;
  }

  function getMembership() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); }
    catch (e) { return null; }
  }
  function setMembership(m) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(m)); } catch (e) {}
  }
  function clearMembership() {
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
  }

  function normCode(c) { return String(c || '').trim().toUpperCase(); }

  // Student joins a class. Stores membership locally and writes a first row.
  async function join(code, name) {
    code = normCode(code);
    name = String(name || '').trim();
    if (!code) throw new Error('Bitte einen Klassencode eingeben.');
    if (!name) throw new Error('Bitte deinen Namen eingeben.');
    if (!ready || !client) throw new Error('Keine Verbindung zum Klassen-Server (Config/Online prüfen).');
    setMembership({ code: code, name: name, studentId: deviceId() });
    const ok = await push({});
    if (!ok) { clearMembership(); throw new Error('Beitritt fehlgeschlagen – bitte Code/Verbindung prüfen.'); }
    return true;
  }

  // Student pushes (upserts) current progress for the joined class.
  async function push(progress) {
    const m = getMembership();
    if (!ready || !client || !m) return false;
    const row = {
      class_code: m.code,
      student_id: m.studentId,
      name: m.name,
      levels_passed: progress.levelsPassed ?? 0,
      total_levels: progress.totalLevels ?? 0,
      current_lesson: progress.currentLesson ?? 1,
      current_level: progress.currentLevel ?? 1,
      accuracy: progress.accuracy ?? 0,
      updated_at: new Date().toISOString()
    };
    try {
      const { error } = await client.from(TABLE).upsert(row, { onConflict: 'class_code,student_id' });
      return !error;
    } catch (e) { return false; }
  }

  window.Classroom = {
    ready: ready,
    configured: hasCfg,
    client: client,
    TABLE: TABLE,
    deviceId: deviceId,
    getMembership: getMembership,
    setMembership: setMembership,
    clearMembership: clearMembership,
    join: join,
    push: push,
    normCode: normCode
  };
})();
