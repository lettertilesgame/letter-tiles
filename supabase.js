// ─── Supabase Client ────────────────────────────────────────────────────────
// Wird von index.html und teacher.html geladen.
// Der anon key ist öffentlich – Zugriff wird über Row Level Security geregelt.

const SUPABASE_URL      = 'https://ywehywtnvwadyjrazmiw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl3ZWh5d3RudndhZHlqcmF6bWl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMTg1OTksImV4cCI6MjA5Nzc5NDU5OX0.QM17Ip70ESfZ_xSDCbp1diOj5B6pWgUlkrFzFiHV9m4';

// Supabase wird über CDN geladen (siehe index.html / teacher.html)
// Nach dem CDN-Script-Tag steht `supabase` global zur Verfügung.
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Schüler-Registrierung ───────────────────────────────────────────────────
// Wird beim ersten Spielstart aufgerufen falls kein Klassencode gesetzt ist.
async function ltEnsureStudent() {
  let classCode   = localStorage.getItem('lt_class_code');
  let studentName = localStorage.getItem('lt_student_name');
  if (classCode && studentName) return;

  // Einfaches Prompt-Overlay (reicht für MVP)
  classCode   = (prompt('Bitte Klassencode eingeben (z.B. 5A-2026):') || '').trim().toUpperCase();
  studentName = (prompt('Wie heißt du? (Vorname reicht)') || '').trim();
  if (!classCode || !studentName) return;

  // Schüler in Supabase anlegen (upsert = kein Fehler wenn schon vorhanden)
  await db.from('students').upsert(
    { class_code: classCode, name: studentName },
    { onConflict: 'class_code,name' }
  ).then(({ error }) => {
    if (error) console.warn('Supabase student upsert:', error.message);
  });

  localStorage.setItem('lt_class_code',   classCode);
  localStorage.setItem('lt_student_name', studentName);
}

// ─── Fortschritt speichern ───────────────────────────────────────────────────
// Wird nach jedem Level-Abschluss aufgerufen.
async function ltSaveProgress({ lessonIndex, levelIndex, accuracy, keystrokes, durationSeconds, passed }) {
  const classCode   = localStorage.getItem('lt_class_code');
  const studentName = localStorage.getItem('lt_student_name');
  if (!classCode || !studentName) return;

  const { error } = await db.from('progress').insert({
    class_code:       classCode,
    student_name:     studentName,
    lesson_index:     lessonIndex,
    level_index:      levelIndex,
    accuracy:         Math.round(accuracy * 100 * 100) / 100, // in %
    keystrokes:       keystrokes,
    duration_seconds: Math.round(durationSeconds),
    passed:           passed
  });
  if (error) console.warn('Supabase progress insert:', error.message);
}
