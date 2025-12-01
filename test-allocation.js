async function testAllocation() {
    try {
        const response = await fetch('http://localhost:3000/parking/enter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                plateNumber: '12가3456',
                type: 'MIDSIZE',
            }),
        });

        const data = await response.json();
        console.log('Status:', response.status);
        console.log('Response:', data);
    } catch (error) {
        console.error('Test failed:', error);
    }
}

testAllocation();
