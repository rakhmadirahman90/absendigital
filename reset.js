const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

initializeApp({
  credential: applicationDefault()
});

const auth = getAuth();

async function reset() {
  try {
    const user1 = await auth.getUserByEmail('admin@perusahaan.com').catch(() => null);
    if (user1) {
      await auth.updateUser(user1.uid, { password: 'password123' });
      console.log('Reset admin@perusahaan.com password to: password123');
    } else {
        console.log('admin@perusahaan.com not found');
    }
    
    const user2 = await auth.getUserByEmail('rakhmadi.rahman90@gmail.com').catch(() => null);
    if (user2) {
      await auth.updateUser(user2.uid, { password: 'password123' });
      console.log('Reset rakhmadi.rahman90@gmail.com password to: password123');
    } else {
        console.log('rakhmadi.rahman90@gmail.com not found');
    }
  } catch(e) {
    console.error(e);
  }
}

reset();
