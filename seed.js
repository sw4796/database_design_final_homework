const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

async function seed() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
    });

    try {
        // 1. Create ParkingLot
        const lotId = uuidv4();
        await connection.execute(
            'INSERT INTO parking_lot (id, name, address) VALUES (?, ?, ?)',
            [lotId, 'Test Mall Parking', '123 Test St']
        );

        // 2. Create ParkingZone
        const zoneId = uuidv4();
        await connection.execute(
            'INSERT INTO parking_zone (id, name, floor, parkingLotId) VALUES (?, ?, ?, ?)',
            [zoneId, 'A', 1, lotId]
        );

        // 3. Create ParkingSpaces (A-01 to A-05)
        for (let i = 1; i <= 5; i++) {
            const spaceId = uuidv4();
            const spaceCode = `A-0${i}`;
            await connection.execute(
                'INSERT INTO parking_space (id, spaceCode, type, status, zoneId) VALUES (?, ?, ?, ?, ?)',
                [spaceId, spaceCode, 'GENERAL', 'EMPTY', zoneId]
            );
        }

        console.log('Seed completed successfully.');
    } catch (error) {
        console.error('Seed failed:', error);
    } finally {
        await connection.end();
    }
}

seed();
