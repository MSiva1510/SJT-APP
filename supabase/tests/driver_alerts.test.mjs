// ─────────────────────────────────────────────────────────────────────────────
// driver_alerts.test.mjs — SQL tests for migrations/20261027_driver_alerts.sql.
// Runs the migration on PGlite (real Postgres in WebAssembly, no Docker) over
// a scaffold shaped like the live tables, then checks driver_raise_alert,
// office notifications, de-duplication, anti-spoofing and RLS.
//
//   cd supabase/tests && npm install && npm test
// ─────────────────────────────────────────────────────────────────────────────
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

// Applied in order, as on the live project.
const MIGRATION = [
  '20261027_driver_alerts.sql',
  '20261027_driver_alerts_fix_notify_type.sql',
].map(f => readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'))
 .join('\n')

const db = new PGlite()

const A_UID = '11111111-1111-1111-1111-111111111111'
const B_UID = '22222222-2222-2222-2222-222222222222'
const ADMIN = '33333333-3333-3333-3333-333333333333'
const MGR   = '44444444-4444-4444-4444-444444444444'
const NODRV = '55555555-5555-5555-5555-555555555555'
const A_DRV = 'aaaaaaaa-0000-0000-0000-000000000001'
const B_DRV = 'bbbbbbbb-0000-0000-0000-000000000002'
const VEH   = 'cccccccc-0000-0000-0000-000000000003'
const A_BK  = 'dddddddd-0000-0000-0000-000000000004'
const B_BK  = 'eeeeeeee-0000-0000-0000-000000000005'

// Supabase-like scaffold: auth.uid() from a session setting, app roles,
// and tables shaped like the live ones (fleet_alerts as the web ERP uses it,
// with vehicle_id NOT NULL to exercise the relaxation).
await db.exec(`
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth, public TO anon, authenticated;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

  CREATE TABLE profiles (id uuid PRIMARY KEY, role text);
  CREATE TABLE drivers (id uuid PRIMARY KEY, profile_id uuid, name text);
  CREATE TABLE bookings (id uuid PRIMARY KEY, driver_id uuid, vehicle_id uuid, booking_no text);
  -- Mirrors live public.notifications (columns + CHECK rules, 2026-10-27).
  CREATE TABLE notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
    title text NOT NULL, message text NOT NULL,
    type text NOT NULL CHECK (type IN ('info','warning','error','success')),
    related_entity text, related_id uuid, is_read boolean,
    read_at timestamptz, created_at timestamptz DEFAULT now(),
    status text CHECK (status IN ('unread','read','archived','dismissed')),
    category text,
    priority text CHECK (priority IN ('low','normal','high','urgent')),
    icon text, action_url text, archived_at timestamptz, dismissed_at timestamptz);
  CREATE TABLE fleet_alerts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vehicle_id uuid NOT NULL,
    driver_id uuid, alert_type text, priority text, status text DEFAULT 'open',
    title text, description text, location jsonb,
    detected_at timestamptz DEFAULT now(), created_at timestamptz DEFAULT now(),
    CHECK (priority IN ('critical','high','medium','low','information')),
    CHECK (status IN ('open','acknowledged','in_progress','resolved','closed')));
  GRANT SELECT, INSERT, UPDATE, DELETE ON fleet_alerts TO anon, authenticated;
  GRANT SELECT ON drivers TO authenticated;
  CREATE PUBLICATION supabase_realtime;

  INSERT INTO profiles VALUES ('${A_UID}','driver'),('${B_UID}','driver'),
    ('${ADMIN}','admin'),('${MGR}','manager'),('${NODRV}','driver');
  INSERT INTO drivers VALUES ('${A_DRV}','${A_UID}','Babu'),('${B_DRV}','${B_UID}','Kumar');
  INSERT INTO bookings VALUES ('${A_BK}','${A_DRV}','${VEH}','SJT-1001'),
                              ('${B_BK}','${B_DRV}','${VEH}','SJT-2002');
`)

let passed = 0
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ok  ', name) }
  catch (e) { console.log('  FAIL', name, '\n       ', e.message); process.exitCode = 1 }
}
const as = async (uid) => db.exec(`RESET ROLE; SELECT set_config('test.uid', '${uid ?? ''}', false)`)
const raise = async (args) => {
  const r = await db.query(`SELECT public.driver_raise_alert(${args}) AS id`)
  return r.rows[0].id
}
const one = async (sql, p = []) => (await db.query(sql, p)).rows[0]
const rejects = async (fn, re) => {
  let err; try { await fn() } catch (e) { err = e }
  assert.ok(err, 'expected an error'); assert.match(err.message, re)
}

await test('migration applies', () => db.exec(MIGRATION))
await test('migration is re-runnable', () => db.exec(MIGRATION))

await test('vehicle_id NOT NULL relaxed; new columns exist', async () => {
  const r = await one(`SELECT is_nullable FROM information_schema.columns
    WHERE table_name='fleet_alerts' AND column_name='vehicle_id'`)
  assert.equal(r.is_nullable, 'YES')
  for (const c of ['source','category','booking_ref','photo_url']) {
    assert.ok(await one(`SELECT 1 AS x FROM information_schema.columns
      WHERE table_name='fleet_alerts' AND column_name=$1`, [c]), c)
  }
})

await test('notifications added to the realtime publication once', async () => {
  const r = await db.query(`SELECT tablename FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'`)
  assert.deepEqual(r.rows.map(x => x.tablename), ['notifications'])
})

await test('fixed function writes only allowed notification types', async () => {
  const src = (await one(`SELECT prosrc FROM pg_proc WHERE proname='driver_raise_alert'`)).prosrc
  assert.ok(!src.includes('SOS_ALERT') && !src.includes('VEHICLE_ISSUE'))
})

let sosId
await test('SOS with own booking: critical alert, vehicle + trip linked', async () => {
  await as(A_UID)
  sosId = await raise(`'sos', NULL, NULL, '${A_BK}', 13.0827, 80.2707, 8`)
  const a = await one(`SELECT * FROM fleet_alerts WHERE id=$1`, [sosId])
  assert.equal(a.alert_type, 'sos'); assert.equal(a.priority, 'critical')
  assert.equal(a.status, 'open'); assert.equal(a.source, 'driver_app')
  assert.equal(a.driver_id, A_DRV); assert.equal(a.vehicle_id, VEH)
  assert.equal(a.booking_ref, 'SJT-1001'); assert.equal(a.location.latitude, 13.0827)
  assert.match(a.title, /SOS: Babu/)
})

await test('office (admin + manager) notified, driver is not', async () => {
  const r = await db.query(`SELECT user_id, type, priority, icon, category, related_entity
    FROM notifications WHERE related_id=$1 ORDER BY user_id`, [sosId])
  assert.deepEqual(r.rows.map(x => x.user_id), [ADMIN, MGR])
  assert.ok(r.rows.every(x => x.type === 'error' && x.priority === 'urgent'
    && x.icon === '🆘' && x.category === 'fleet' && x.related_entity === 'fleet_alert'))
})

await test('repeat SOS within 60 s returns the same alert', async () => {
  assert.equal(await raise(`'sos'`), sosId)
  assert.equal((await one(`SELECT count(*)::int AS n FROM fleet_alerts WHERE alert_type='sos'`)).n, 1)
})

await test("another driver's booking is not linked", async () => {
  const id = await raise(`'vehicle_issue', 'Flat Tire / Puncture', 'rear left', '${B_BK}'`)
  const a = await one(`SELECT * FROM fleet_alerts WHERE id=$1`, [id])
  assert.equal(a.booking_ref, null); assert.equal(a.vehicle_id, null)
  assert.equal(a.priority, 'high'); assert.equal(a.description, 'rear left')
})

await test('vehicle issue notifies the office as a warning', async () => {
  await as(A_UID)
  const id = await raise(`'vehicle_issue', 'Electrical Issue', 'battery'`)
  const r = await db.query(`SELECT type, priority FROM notifications WHERE related_id=$1`, [id])
  assert.equal(r.rows.length, 2)
  assert.ok(r.rows.every(x => x.type === 'warning' && x.priority === 'high'))
})

await test('different issue category is a new alert; accident is critical', async () => {
  const id = await raise(`'vehicle_issue', 'Accident / Collision', 'minor'`)
  const a = await one(`SELECT priority, category FROM fleet_alerts WHERE id=$1`, [id])
  assert.equal(a.priority, 'critical'); assert.equal(a.category, 'Accident / Collision')
})

await test("photo URL kept only if it is the driver's own upload", async () => {
  await as(B_UID)
  const own = `https://x.supabase.co/storage/v1/object/public/documents/driver-documents/${B_UID}/issue_1.jpg`
  const foreign = `https://evil.example/driver-documents/${A_UID}/x.jpg`
  const id1 = await raise(`'vehicle_issue', 'Electrical Issue', NULL, NULL, NULL, NULL, NULL, '${own}'`)
  const id2 = await raise(`'vehicle_issue', 'Other', NULL, NULL, NULL, NULL, NULL, '${foreign}'`)
  assert.equal((await one(`SELECT photo_url FROM fleet_alerts WHERE id=$1`, [id1])).photo_url, own)
  assert.equal((await one(`SELECT photo_url FROM fleet_alerts WHERE id=$1`, [id2])).photo_url, null)
})

await test('out-of-range coordinates are dropped', async () => {
  await as(B_UID)
  const id = await raise(`'sos', NULL, NULL, NULL, 200, 80`)
  assert.equal((await one(`SELECT location FROM fleet_alerts WHERE id=$1`, [id])).location, null)
})

await test('rejects: signed out, no driver row, unknown type', async () => {
  await as(null);  await rejects(() => raise(`'sos'`), /not signed in/)
  await as(NODRV); await rejects(() => raise(`'sos'`), /no driver record/)
  await as(A_UID); await rejects(() => raise(`'party'`), /unknown alert type/)
})

await test('anon: no table access and cannot call the function', async () => {
  await as(A_UID); await db.exec('SET ROLE anon')
  await rejects(() => db.query('SELECT * FROM fleet_alerts'), /permission denied/)
  await rejects(() => raise(`'sos'`), /permission denied/)
  await db.exec('RESET ROLE')
})

await test('RLS on: each driver reads only their own alerts', async () => {
  await db.exec('RESET ROLE; ALTER TABLE fleet_alerts ENABLE ROW LEVEL SECURITY')
  await as(A_UID); await db.exec('SET ROLE authenticated')
  const a = await db.query('SELECT DISTINCT driver_id FROM fleet_alerts')
  assert.deepEqual(a.rows.map(r => r.driver_id), [A_DRV])
  await db.exec('RESET ROLE'); await as(B_UID); await db.exec('SET ROLE authenticated')
  const b = await db.query('SELECT DISTINCT driver_id FROM fleet_alerts')
  assert.deepEqual(b.rows.map(r => r.driver_id), [B_DRV])
  await db.exec('RESET ROLE')
})

await test('function still works for a driver under RLS (SECURITY DEFINER)', async () => {
  await as(A_UID); await db.exec('SET ROLE authenticated')
  const id = await raise(`'vehicle_issue', 'Mechanical Failure', 'engine noise'`)
  assert.ok(id)
  await db.exec('RESET ROLE')
})

await test('missing notification columns never lose the alert', async () => {
  await db.exec('RESET ROLE; ALTER TABLE notifications DROP COLUMN icon')
  await as(B_UID)
  const id = await raise(`'vehicle_issue', 'Mechanical Failure'`)
  assert.ok(await one(`SELECT 1 AS x FROM fleet_alerts WHERE id=$1`, [id]))
})

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`)
