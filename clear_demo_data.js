const mysql = require('mysql2/promise');
require('dotenv').config();

async function clearDemoData() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
    });

    try {
        console.log('Starting demo data cleanup...');

        // 1. Disable FK Checks
        await connection.execute('SET FOREIGN_KEY_CHECKS = 0');

        // 2. Clear Data
        console.log('Clearing Applied Discounts...');
        await connection.execute('DELETE FROM applied_discount');

        console.log('Clearing Payment Logs...');
        await connection.execute('DELETE FROM payment_log');

        console.log('Clearing Purchase History...');
        await connection.execute('DELETE FROM purchase_history');

        console.log('Clearing Assignment Logs...');
        await connection.execute('DELETE FROM assignment_log');

        console.log('Clearing Parking Logs...');
        await connection.execute('DELETE FROM parking_log');

        console.log('Clearing Discount Rules...');
        await connection.execute('DELETE FROM discount_rule');

        console.log('Clearing Fee Policies...');
        await connection.execute('DELETE FROM fee_policy');

        // 3. Re-enable FK Checks
        await connection.execute('SET FOREIGN_KEY_CHECKS = 1');

        // Note: We are keeping Users, Vehicles, Parking Lots, Zones, and Spaces as requested.
        // If vehicles need to be cleared, uncomment the following:
        // await connection.execute('DELETE FROM vehicle');

        console.log('Demo data cleanup completed successfully.');

    } catch (error) {
        console.error('Cleanup failed:', error);
    } finally {
        await connection.end();
    }
}

clearDemoData();
