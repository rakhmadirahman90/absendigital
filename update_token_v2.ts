import { initializeApp } from 'firebase/app';
import { initializeFirestore, doc, updateDoc } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

async function main() {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (!fs.existsSync(configPath)) {
    console.error("No config path found!");
    return;
  }
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const app = initializeApp(config);
  const db = initializeFirestore(app, {}, config.firestoreDatabaseId);

  const newToken = "CnWD8XqvzqcfQvi8P6bGJfhKJpv9BwX8Lk9t8sWdJU";
  console.log(`Updating token to exactly: |${newToken}| (Length: ${newToken.length})`);

  try {
    const settingsDocRef = doc(db, 'settings', 'wa_reminder_settings');
    await updateDoc(settingsDocRef, {
      apiToken: newToken.trim()
    });
    console.log("Success: Fonnte API Token updated in Firestore.");
  } catch (err: any) {
    console.error("Error updating token:", err.message || err);
  }
}

main().catch(console.error);
