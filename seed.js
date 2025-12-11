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
        // Clear existing data
        await connection.execute('DELETE FROM payment_log');
        await connection.execute('DELETE FROM assignment_log');
        await connection.execute('DELETE FROM parking_log');
        await connection.execute('DELETE FROM parking_space');
        await connection.execute('DELETE FROM parking_zone');
        await connection.execute('DELETE FROM parking_lot');

        const lots = [
            { name: 'Shopping Mall A', address: '123 Main St' },
            { name: 'Shopping Mall B', address: '456 Market St' }
        ];

        const zonesPerLot = ['A', 'B', 'C'];

        // Layout Config
        const spaceWidth = 60;
        const spaceHeight = 40;
        const roadHeight = 60; // Wider for road
        const gapX = 10;
        const gapY = 10;
        const startX = 50;
        const startY = 50;

        const columns = 10; // 10 spaces per row

        for (const lotData of lots) {
            const lotId = uuidv4();
            await connection.execute(
                'INSERT INTO parking_lot (id, name, address) VALUES (?, ?, ?)',
                [lotId, lotData.name, lotData.address]
            );
            console.log(`Created Lot: ${lotData.name}`);

            for (let zIndex = 0; zIndex < zonesPerLot.length; zIndex++) {
                const zoneName = zonesPerLot[zIndex];
                const zoneId = uuidv4();
                await connection.execute(
                    'INSERT INTO parking_zone (id, name, floor, parkingLotId) VALUES (?, ?, ?, ?)',
                    [zoneId, zoneName, zIndex + 1, lotId]
                );
                console.log(`  Created Zone: ${zoneName}`);

                let currentY = startY;
                let spaceCount = 0;
                let rowCount = 0;

                // Loop until we hit 100 spaces
                while (spaceCount < 100) {
                    // Create a row of spaces
                    for (let c = 0; c < columns; c++) {
                        if (spaceCount >= 100) break;
                        spaceCount++;

                        const spaceId = uuidv4();
                        const spaceCode = `${zoneName}-${String(spaceCount).padStart(3, '0')}`;

                        const x = startX + c * (spaceWidth + gapX);
                        const y = currentY;

                        await connection.execute(
                            'INSERT INTO parking_space (id, spaceCode, type, status, zoneId, x, y, width, height, rotation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                            [spaceId, spaceCode, 'GENERAL', 'EMPTY', zoneId, x, y, spaceWidth, spaceHeight, 0]
                        );
                    }

                    currentY += spaceHeight + gapY;
                    rowCount++;

                    // Add a road after every 2 rows
                    if (rowCount % 2 === 0 && spaceCount < 100) {
                        currentY += roadHeight;
                    }
                }
            }
        }

        console.log('Seed completed successfully.');
    } catch (error) {
        console.error('Seed failed:', error);
    } finally {
        await connection.end();
    }
}

seed();
