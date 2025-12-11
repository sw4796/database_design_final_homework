// Use built-in fetch (Node 18+)
const fs = require('fs');

async function run() {
    try {
        // 1. Get Parking Lots
        console.log('Fetching parking lots...');
        const lotsRes = await fetch('http://localhost:3000/parking/lots');
        const lots = await lotsRes.json();
        if (lots.length === 0) {
            console.log('No parking lots found.');
            return;
        }
        const lotId = lots[0].id;
        console.log(`Using Lot ID: ${lotId}`);

        // 2. Enter a new vehicle
        const plateNumber = `TEST-${Math.floor(Math.random() * 10000)}`;
        console.log(`Entering vehicle: ${plateNumber}`);
        const enterRes = await fetch('http://localhost:3000/parking/enter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                plateNumber: plateNumber,
                type: 'MIDSIZE',
                lotId: lotId
            })
        });

        if (!enterRes.ok) {
            console.log('Enter failed:', enterRes.status, enterRes.statusText);
            const text = await enterRes.text();
            console.log('Response:', text);
            return;
        }
        console.log('Vehicle entered successfully.');

        // 3. Get Users
        console.log('Fetching users...');
        const usersRes = await fetch('http://localhost:3000/users');
        const users = await usersRes.json();
        if (users.length === 0) {
            console.log('No users found.');
            return;
        }

        let targetUser = users.find(u => u.name === '홍길동' || u.name === 'Hong Gil-dong');
        if (!targetUser) {
            console.log('Hong Gil-dong not found, using first user.');
            targetUser = users[0];
        }

        const userId = targetUser.id;
        console.log(`Using User ID: ${userId} (${targetUser.name})`);

        // 4. Call Preview Fee
        console.log('Calling previewFee...');
        const previewRes = await fetch('http://localhost:3000/payment/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                plateNumber: plateNumber,
                userId: userId
            })
        });

        if (previewRes.ok) {
            console.log('Preview success!');
        } else {
            console.log('Preview failed:', previewRes.status, previewRes.statusText);
        }

        const text = await previewRes.text();
        console.log('Response:', text);
        fs.writeFileSync('debug_output.txt', text);

    } catch (error) {
        console.error('Error:', error);
        fs.writeFileSync('debug_output.txt', 'Error: ' + error.message);
    }
}

run();
