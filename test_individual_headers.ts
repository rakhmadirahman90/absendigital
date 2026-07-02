import fetch from 'node-fetch';

async function testIndividualHeaders() {
  const token = "wavio_a9aef1ead31825220df46c29fecac3738eafda0884c2c950bba2b55a441ce75b";
  const targetNumber = "6281219027234";
  const message = "Test koneksi Wavio.";

  const testHeaders = [
    { 'api-key': token },
    { 'key': token },
    { 'Authorization': `Bearer ${token}`, 'api-key': token },
    { 'Authorization': `Bearer ${token}`, 'key': token },
    { 'X-API-Key': token, 'api-key': token },
    { 'X-API-Key': token, 'key': token },
  ];

  for (const h of testHeaders) {
    try {
      const payload = {
        number: targetNumber,
        message: message
      };
      
      const response = await fetch('https://api.wavio.web.id/api/v1/public', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...h
        },
        body: JSON.stringify(payload)
      });
      
      const text = await response.text();
      console.log(`Headers: ${JSON.stringify(h)}`);
      console.log(`Status: ${response.status}`);
      console.log(`Response: ${text}\n`);
    } catch (err: any) {
      console.log(`Error: ${err.message}\n`);
    }
  }
}

testIndividualHeaders().catch(console.error);
