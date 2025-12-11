const { DataSource } = require('typeorm');
const fs = require('fs');

async function run() {
    let logBuffer = '';
    const log = (...args) => {
        const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : a).join(' ');
        console.log(msg);
        logBuffer += msg + '\n';
    };

    try {
        log('1. Finding User and Lot...');
        const lotsRes = await fetch('http://localhost:3000/parking/lots');
        const lots = await lotsRes.json();
        const lotId = lots[0].id;

        const usersRes = await fetch('http://localhost:3000/users');
        const users = await usersRes.json();
        const user = users.find(u => u.name === '홍길동' || u.name === 'Hong Gil-dong');

        if (!user) {
            log('User Hong Gil-dong not found!');
            fs.writeFileSync('debug_discount_output.txt', logBuffer);
            return;
        }
        log(`User found: ${user.name} (${user.id}), Grade: ${user.grade}`);
        log(`Lot found: ${lots[0].name} (${lotId})`);

        // 2. Check Discount Rules
        const rulesRes = await fetch(`http://localhost:3000/policy/discount?lotId=${lotId}`);
        if (rulesRes.ok) {
            const rules = await rulesRes.json();
            log(`Discount Rules found: ${rules.length}`);
            log(rules);
        } else {
            log('Failed to fetch discount rules.');
        }

        // 3. Check Purchase History
        const historyRes = await fetch(`http://localhost:3000/purchase-history?userId=${user.id}`);
        if (historyRes.ok) {
            const history = await historyRes.json();
            log(`Total Purchase History items: ${history.length}`);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayHistory = history.filter(h => new Date(h.purchaseTime) >= today);
            log(`Today's Purchase History:`, todayHistory);
            const totalAmount = todayHistory.reduce((sum, h) => sum + Number(h.amount), 0);
            log(`Total Purchase Amount Today: ${totalAmount}`);
        } else {
            log('Failed to fetch purchase history.');
        }

        // 4. Create a dummy vehicle and enter it to test preview
        const plateNumber = `DISC-TEST-${Math.floor(Math.random() * 1000)}`;
        log(`Entering vehicle ${plateNumber}...`);
        await fetch('http://localhost:3000/parking/enter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plateNumber, type: 'MIDSIZE', lotId })
        });

        // 5. Preview Fee
        log('Previewing Fee...');
        const previewRes = await fetch('http://localhost:3000/payment/preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plateNumber, userId: user.id })
        });

        const previewData = await previewRes.json();
        log('Preview Result:', previewData);
        fs.writeFileSync('debug_discount_output.txt', logBuffer);

    } catch (e) {
        log('Script Error:', e);
        if (e.cause) log('Cause:', e.cause);
        fs.writeFileSync('debug_discount_output.txt', logBuffer);
    }
}

run();
