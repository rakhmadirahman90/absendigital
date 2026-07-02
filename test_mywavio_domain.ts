import fetch from 'node-fetch';

async function testMyWavioDomain() {
  const token = "wavio_a9aef1ead31825220df46c29fecac3738eafda0884c2c950bba2b55a441ce75b";
  const targetNumber = "6281219027234";
  const message = "Test koneksi Wavio.";

  const domains = [
    'https://api.mywavio.com/api/v1/public',
    'https://api.mywavio.com/api/v1/send',
    'https://api.mywavio.com/api/send',
    'https://mywavio.com/api/v1/public',
    'https://api.wavio.web.id/api/v1/public',
  ];

  for (const url of domains) {
    try {
      const payload = {
        apikey: token,
        api_key: token,
        key: token,
        token: token,
        number: targetNumber,
        target: targetNumber,
        to: targetNumber,
        message: message,
        text: message
      };
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-API-KEY': token,
          'X-API-Key': token,
          'x-api-key': token,
          'api-key': token,
          'key': token
        },
        body: JSON.stringify(payload)
      });
      
      const text = await response.text();
      console.log(`URL: ${url}`);
      console.log(`Status: ${response.status}`);
      console.log(`Response: ${text}\n`);
    } catch (err: any) {
      console.log(`URL: ${url} -> Error: ${err.message}\n`);
    }
  }
}

testMyWavioDomain().catch(console.error);
