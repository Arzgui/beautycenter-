import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { db, initializeDatabase } from '../config/database.js';
import bookings from '../routes/bookings.js';
import adminBookings from '../routes/admin/bookings.js';
import schedules from '../routes/admin/schedules.js';
import unavailability from '../routes/admin/unavailability.js';
import { verifyAdmin } from '../middleware/auth.js';
import { errorHandler } from '../middleware/errorHandler.js';
const app=express();app.use(express.json());app.use('/bookings',bookings);app.use('/admin/bookings',verifyAdmin,adminBookings);app.use('/admin/schedules',verifyAdmin,schedules);app.use('/admin/unavailability',verifyAdmin,unavailability);app.use(errorHandler);
const payload={clientName:'Client',clientEmail:'owner@example.com',clientPhone:'+33600000000',serviceZone:'visage',appointmentDate:'2099-06-15',appointmentStart:'10:00'};
const token=id=>jwt.sign({id},process.env.JWT_SECRET);
const adminHeader={Authorization:'Bearer '+token('admin')};
beforeAll(async()=>{await initializeDatabase();});
beforeEach(async()=>{
  await db.run('DELETE FROM bookings');await db.run('DELETE FROM unavailability');await db.run('DELETE FROM users');
  await db.run("DELETE FROM schedules WHERE id NOT LIKE 'default:%'");
  await db.run("UPDATE schedules SET duration=30,price=40,active=1 WHERE zone='visage'");
  for(const [id,email,role,verified] of [['admin','admin@example.com','admin',1],['owner',payload.clientEmail,'client',1],['other','other@example.com','client',1],['unverified','unverified@example.com','client',0]])await db.run('INSERT INTO users(id,email,role,emailVerified,passwordHash,createdAt) VALUES (?,?,?,?,?,?)',id,email,role,verified,'synthetic','2026-01-01');
});
async function create(extra={},as=null){const q=request(app).post('/bookings');if(as)q.set('Authorization','Bearer '+token(as));return q.send({...payload,...extra});}
async function finish(id){return request(app).patch(`/admin/bookings/${id}/status`).set(adminHeader).send({status:'completed'});}
const points=id=>db.get('SELECT points FROM users WHERE id=?',id);
const availability=(serviceZone='visage')=>request(app).get('/bookings/availability').query({date:payload.appointmentDate,serviceZone});

test.each([
  ['2026-07-02T07:07:00Z','2026-07-02'],
  ['2026-01-05T08:07:00Z','2026-01-05'],
  ['2026-03-30T07:07:00Z','2026-03-30'],
  ['2026-10-26T08:07:00Z','2026-10-26'],
])('same-day availability and booking follow Paris clock at %s',async(now,date)=>{
  jest.useFakeTimers({now:new Date(now),doNotFake:['nextTick','queueMicrotask','setImmediate','clearImmediate','setTimeout','clearTimeout','setInterval','clearInterval','hrtime','performance']});
  try {
    const slots=await request(app).get('/bookings/availability').query({date,serviceZone:'visage'});
    expect(slots.status).toBe(200);
    expect(slots.body.availableSlots).not.toContain('09:00');
    expect(slots.body.availableSlots).toContain('09:15');
    expect((await create({appointmentDate:date,appointmentStart:'09:00'})).status).toBe(400);
    expect((await create({appointmentDate:date,appointmentStart:'09:15'})).status).toBe(201);
  } finally {jest.useRealTimers();}
});

test('Paris midnight rejects previous calendar day even while UTC is still yesterday',async()=>{
  jest.useFakeTimers({now:new Date('2026-07-01T22:30:00Z'),doNotFake:['nextTick','queueMicrotask','setImmediate','clearImmediate','setTimeout','clearTimeout','setInterval','clearInterval','hrtime','performance']});
  try {
    const previous=await request(app).get('/bookings/availability').query({date:'2026-07-01',serviceZone:'visage'});
    expect(previous.body.availableSlots).toEqual([]);
    expect((await create({appointmentDate:'2026-07-01'})).status).toBe(400);
    expect((await create({appointmentDate:'2026-07-02',appointmentStart:'09:00'})).status).toBe(201);
  } finally {jest.useRealTimers();}
});

test('one professional serves different services back to back with half-open intervals',async()=>{
  expect((await create({serviceZone:'dos',appointmentStart:'10:00'})).status).toBe(201);
  const slots=await availability('maillot');
  expect(slots.body.availableSlots).toContain('09:15'); // 45 minutes ends exactly at 10:00.
  expect(slots.body.availableSlots).not.toContain('09:30');
  expect(slots.body.availableSlots).not.toContain('10:45');
  expect(slots.body.availableSlots).toContain('11:00');
  expect((await create({serviceZone:'maillot',appointmentStart:'09:15'})).status).toBe(201);
  expect((await create({serviceZone:'maillot',appointmentStart:'11:00'})).status).toBe(201);
  expect((await create({appointmentStart:'10:15'})).status).toBe(409);
});

test('simultaneous different services compete for the same professional',async()=>{
  const results=await Promise.all([create({serviceZone:'dos'}),create({serviceZone:'maillot',appointmentStart:'10:15'})]);
  expect(results.map(result=>result.status).sort()).toEqual([201,409]);
  expect((await db.get('SELECT COUNT(*) AS n FROM bookings')).n).toBe(1);
});

test('administrative move releases old interval, blocks new full duration and rejects closing overflow',async()=>{
  const created=await create({serviceZone:'dos'});
  const row=await db.get('SELECT * FROM bookings WHERE id=?',created.body.bookingId);
  const edit={...row,appointmentStart:'12:00'};delete edit.appointmentEnd;
  expect((await request(app).patch(`/admin/bookings/${row.id}`).set(adminHeader).send(edit)).status).toBe(200);
  expect((await db.get('SELECT appointmentEnd FROM bookings WHERE id=?',row.id)).appointmentEnd).toBe('13:00');
  const slots=await availability();
  expect(slots.body.availableSlots).toContain('10:00');
  expect(slots.body.availableSlots).not.toContain('11:45');
  expect(slots.body.availableSlots).not.toContain('12:45');
  expect(slots.body.availableSlots).toContain('13:00');
  expect((await request(app).patch(`/admin/bookings/${row.id}`).set(adminHeader).send({...edit,appointmentStart:'18:15'})).status).toBe(400);
  expect((await db.get('SELECT appointmentStart FROM bookings WHERE id=?',row.id)).appointmentStart).toBe('12:00');
});

test('configured full-day closure blocks all services and reopening restores availability',async()=>{
  const block=await request(app).post('/admin/unavailability').set(adminHeader).send({appointmentDate:payload.appointmentDate,appointmentStart:'09:00',appointmentEnd:'19:00',reason:'Fermeture exceptionnelle'});
  expect(block.status).toBe(201);
  for(const zone of ['visage','maillot','dos']) {
    expect((await availability(zone)).body.availableSlots).toEqual([]);
    expect((await create({serviceZone:zone})).status).toBe(409);
  }
  expect((await request(app).delete(`/admin/unavailability/${block.body.id}`).set(adminHeader)).status).toBe(204);
  expect((await availability()).body.availableSlots).toContain('09:00');
});

test('45-minute service ends at closing and cancellation frees its complete interval',async()=>{
  const result=await create({serviceZone:'maillot',appointmentStart:'18:15'});
  expect(result.status).toBe(201);
  const row=await db.get('SELECT * FROM bookings WHERE id=?',result.body.bookingId);
  expect(row.appointmentEnd).toBe('19:00');
  expect((await create({serviceZone:'maillot',appointmentStart:'18:30'})).status).toBe(400);
  expect((await availability()).body.availableSlots).not.toContain('18:00');
  expect((await request(app).post('/bookings/cancel').send({token:row.cancellationToken})).status).toBe(200);
  expect((await availability('maillot')).body.availableSlots).toContain('18:15');
});

test('duration need not be a multiple of 15 while public starts remain on the grid',async()=>{
  const config=await db.get("SELECT * FROM schedules WHERE zone='visage'");
  expect((await request(app).patch(`/admin/schedules/${config.id}`).set(adminHeader).send({...config,duration:20})).status).toBe(200);
  const result=await create();expect(result.status).toBe(201);
  expect((await db.get('SELECT appointmentEnd FROM bookings WHERE id=?',result.body.bookingId)).appointmentEnd).toBe('10:20');
  const slots=await availability();
  expect(slots.body.availableSlots).not.toContain('10:15');
  expect(slots.body.availableSlots).toContain('10:30');
  expect(slots.body.availableSlots.every(slot=>Number(slot.slice(3))%15===0)).toBe(true);
});

test('completion between admin read and write cannot transfer an already credited account',async()=>{
  const response=await create({},'owner');
  const row=await db.get('SELECT * FROM bookings WHERE id=?',response.body.bookingId);
  const original=db.run.bind(db);
  const intercepted=jest.spyOn(db,'run').mockImplementation(async(sql,...args)=>{
    if(sql.startsWith('UPDATE bookings SET clientName='))await original("UPDATE bookings SET status='completed' WHERE id=?",row.id);
    return original(sql,...args);
  });
  try {
    expect((await request(app).patch(`/admin/bookings/${row.id}`).set(adminHeader).send({...row,clientEmail:'other@example.com',userId:'other'})).status).toBe(409);
    expect((await db.get('SELECT userId FROM bookings WHERE id=?',row.id)).userId).toBe('owner');
    expect((await points('owner')).points).toBe(4);expect((await points('other')).points).toBe(0);
  } finally {intercepted.mockRestore();}
});
test('guest supplying another customer email never receives automatic account association or credits',async()=>{const response=await create();expect(response.status).toBe(201);const row=await db.get('SELECT * FROM bookings WHERE id=?',response.body.bookingId);expect(row.userId).toBeNull();expect((await finish(row.id)).status).toBe(200);expect((await points('owner')).points).toBe(0);expect((await points('other')).points).toBe(0);});
test('forged public userId and mismatched authenticated email cannot credit a third party',async()=>{expect((await create({userId:'owner'})).status).toBe(400);expect((await create({},'other')).status).toBe(403);expect((await db.get('SELECT COUNT(*) AS n FROM bookings')).n).toBe(0);});
test('verified owner booking earns once through authenticated userId',async()=>{const response=await create({},'owner');expect(response.status).toBe(201);expect((await db.get('SELECT userId FROM bookings WHERE id=?',response.body.bookingId)).userId).toBe('owner');const completed=await Promise.all([finish(response.body.bookingId),finish(response.body.bookingId)]);expect(completed.every(r=>r.status===200)).toBe(true);expect((await points('owner')).points).toBe(4);});
test('unverified account remains able to reserve as guest without fidelity credit',async()=>{const response=await create({clientEmail:'unverified@example.com'},'unverified');expect(response.status).toBe(201);await finish(response.body.bookingId);expect((await points('unverified')).points).toBe(0);});
test('invalid or stale bearer is not silently downgraded to guest',async()=>{expect((await request(app).post('/bookings').set('Authorization','Bearer invalid').send(payload)).status).toBe(401);await db.run("UPDATE users SET sessionVersion=1 WHERE id='owner'");expect((await create({},'owner')).status).toBe(401);});
test('admin can explicitly associate a guest with the matching verified account and credit completed appointment once',async()=>{const response=await create();await finish(response.body.bookingId);const row=await db.get('SELECT * FROM bookings WHERE id=?',response.body.bookingId);expect((await request(app).patch(`/admin/bookings/${row.id}`).set('Authorization','Bearer '+token('other')).send({...row,userId:'owner'})).status).toBe(403);expect((await request(app).patch(`/admin/bookings/${row.id}`).set(adminHeader).send({...row,userId:'other'})).status).toBe(400);expect((await request(app).patch(`/admin/bookings/${row.id}`).set(adminHeader).send({...row,userId:'owner'})).status).toBe(200);expect((await points('owner')).points).toBe(4);expect((await request(app).patch(`/admin/bookings/${row.id}`).set(adminHeader).send({...row,userId:'owner'})).status).toBe(200);expect((await points('owner')).points).toBe(4);expect((await request(app).patch(`/admin/bookings/${row.id}`).set(adminHeader).send({...row,userId:null})).status).toBe(409);});
test('editing contact email never transfers fidelity to another account',async()=>{const response=await create({},'owner');const row=await db.get('SELECT * FROM bookings WHERE id=?',response.body.bookingId);expect((await request(app).patch(`/admin/bookings/${row.id}`).set(adminHeader).send({...row,clientEmail:'other@example.com'})).status).toBe(200);await finish(row.id);expect((await points('owner')).points).toBe(4);expect((await points('other')).points).toBe(0);});
test('availability covers 15-minute starts from 09:00, including former non-test slots',async()=>{const res=await availability();expect(res.status).toBe(200);expect(res.body.slots).toHaveLength(40);expect(res.body.availableSlots[0]).toBe('09:00');expect(res.body.availableSlots).toContain('09:15');expect(res.body.availableSlots).toContain('18:30');expect(res.body.availableSlots).not.toContain('18:45');expect((await create({appointmentStart:'09:15'})).status).toBe(201);});
test('duration and full overlap are enforced on public requests, closing boundary is exact',async()=>{expect((await create({appointmentStart:'18:30'})).status).toBe(201);expect((await create({appointmentStart:'18:45'})).status).toBe(400);expect((await create({appointmentStart:'09:01'})).status).toBe(400);expect((await create({appointmentStart:'08:45'})).status).toBe(400);});
test('admin duration changes affect future availability and bookings but never existing appointment end',async()=>{const old=await create();const config=await db.get("SELECT * FROM schedules WHERE zone='visage'");expect((await request(app).patch(`/admin/schedules/${config.id}`).set(adminHeader).send({...config,duration:75})).status).toBe(200);const slots=await availability();expect(slots.body.duration).toBe(75);expect(slots.body.availableSlots).not.toContain('09:00');expect(slots.body.availableSlots).toContain('10:30');expect(slots.body.availableSlots).not.toContain('18:00');const next=await create({appointmentStart:'11:00'});expect(next.status).toBe(201);expect((await db.get('SELECT appointmentEnd FROM bookings WHERE id=?',next.body.bookingId)).appointmentEnd).toBe('12:15');expect((await db.get('SELECT appointmentEnd FROM bookings WHERE id=?',old.body.bookingId)).appointmentEnd).toBe('10:30');expect((await create({appointmentStart:'14:00',duration:30})).status).toBe(409);});
test('service management is protected and rejects invalid durations, supports free services and new zones',async()=>{const config=await db.get("SELECT * FROM schedules WHERE zone='visage'");for(const duration of [0,14,601,15.5])expect((await request(app).patch(`/admin/schedules/${config.id}`).set(adminHeader).send({...config,duration})).status).toBe(400);expect((await request(app).patch(`/admin/schedules/${config.id}`).send({...config,duration:60})).status).toBe(401);expect((await request(app).post('/admin/schedules').set(adminHeader).send({zone:'new_service',label:'New',duration:45,price:0})).status).toBe(201);expect((await request(app).get('/bookings/services')).body.services.some(s=>s.zone==='new_service')).toBe(true);expect((await create({serviceZone:'new_service'})).status).toBe(201);});
test('deactivating service preserves old bookings and blocks new reservations',async()=>{const old=await create();const config=await db.get("SELECT id FROM schedules WHERE zone='visage'");expect((await request(app).delete(`/admin/schedules/${config.id}`).set(adminHeader)).status).toBe(200);expect((await create({appointmentStart:'11:00'})).status).toBe(400);expect((await db.get('SELECT id FROM bookings WHERE id=?',old.body.bookingId)).id).toBeTruthy();});
test('unavailability blocks the entire service duration and is removable',async()=>{const response=await request(app).post('/admin/unavailability').set(adminHeader).send({appointmentDate:payload.appointmentDate,appointmentStart:'10:30',appointmentEnd:'11:15',reason:'Pause'});expect(response.status).toBe(201);const slots=await availability();expect(slots.body.availableSlots).toContain('10:00');expect(slots.body.unavailableSlots).toEqual(expect.arrayContaining(['10:15','10:30','10:45','11:00']));expect((await create({appointmentStart:'10:15'})).status).toBe(409);expect((await request(app).delete(`/admin/unavailability/${response.body.id}`).set(adminHeader)).status).toBe(204);expect((await create({appointmentStart:'10:15'})).status).toBe(201);});
test('simultaneous reservation and unavailability cannot both occupy a slot',async()=>{const results=await Promise.all([create(),request(app).post('/admin/unavailability').set(adminHeader).send({appointmentDate:payload.appointmentDate,appointmentStart:'10:00',appointmentEnd:'10:30'})]);expect(results.map(r=>r.status).sort()).toEqual([201,409]);});
test('authorized admin can use minute-specific starts with computed duration, conflicts remain blocked',async()=>{const first=await create();const row=await db.get('SELECT * FROM bookings WHERE id=?',first.body.bookingId);expect((await request(app).patch(`/admin/bookings/${row.id}`).set(adminHeader).send({...row,appointmentStart:'09:07',appointmentEnd:'09:37'})).status).toBe(200);expect((await create({appointmentStart:'09:30'})).status).toBe(409);expect((await create({appointmentStart:'09:45'})).status).toBe(201);});
test('concurrent partially overlapping services have one winner; cancellation refreshes slots',async()=>{const responses=await Promise.all([create(),create({appointmentStart:'10:15'})]);expect(responses.map(r=>r.status).sort()).toEqual([201,409]);const row=await db.get('SELECT * FROM bookings');expect((await request(app).post('/bookings/cancel').send({token:row.cancellationToken})).status).toBe(200);expect((await availability()).body.availableSlots).toContain('10:00');});
