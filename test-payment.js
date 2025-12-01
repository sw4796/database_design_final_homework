async function testPayment() {
    try {
        // 1. Enter Vehicle (to ensure we have a log)
        console.log('--- Entering Vehicle ---');
        const enterRes = await fetch('http://localhost:3000/parking/enter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plateNumber: '99하9999', type: 'LARGE' }),
        });
        console.log('Enter Status:', enterRes.status);
        const enterData = await enterRes.json();
        console.log('Enter Data:', enterData);

        // Wait a bit (simulating time pass? actually 0 duration is fine for test)

        // 2. Calculate Fee
        console.log('\n--- Calculating Fee ---');
        const calcRes = await fetch('http://localhost:3000/payment/calculate?plateNumber=99하9999');
        console.log('Calc Status:', calcRes.status);
        const calcData = await calcRes.json();
        console.log('Calc Data:', calcData);

        // 3. Pay
        console.log('\n--- Processing Payment ---');
        const payRes = await fetch('http://localhost:3000/payment/pay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                plateNumber: '99하9999',
                amount: calcData.amount,
                method: 'CARD',
            }),
        });
        console.log('Pay Status:', payRes.status);
        const payData = await payRes.json();
        console.log('Pay Data:', payData);

    } catch (error) {
        console.error('Test failed:', error);
    }
}

testPayment();
