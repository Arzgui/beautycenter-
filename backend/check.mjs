import sqlite3 from 'sqlite3';
const db = new sqlite3.Database('./database.sqlite');
db.all('SELECT clientEmail, status, pointsEarned, price FROM bookings LIMIT 5', (err, rows) => { 
  console.log(rows); 
  db.close(); 
});