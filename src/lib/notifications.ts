import { db } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export type NotificationType = 'attendance' | 'submission_approved' | 'submission_rejected';

export interface AppNotification {
  id?: string;
  user_id: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  created_at: any;
}

export async function createNotification(
  userId: string,
  title: string,
  message: string,
  type: NotificationType
) {
  try {
    await addDoc(collection(db, 'notifications'), {
      user_id: userId,
      title,
      message,
      type,
      read: false,
      created_at: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error creating notification:', error);
  }
}
