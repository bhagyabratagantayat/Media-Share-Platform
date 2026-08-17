import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const projectId = process.env.FIREBASE_PROJECT_ID || 'media-share-website';

function initAdminApp() {
  if (getApps().length > 0) {
    return getApp();
  }
  try {
    return initializeApp({
      projectId,
      storageBucket: `${projectId}.firebasestorage.app`,
    });
  } catch (err) {
    console.warn('[Firebase Admin] Init warning:', err);
    return null;
  }
}

const adminApp = initAdminApp();

export const adminAuth = adminApp ? getAuth(adminApp) : null;
export const adminFirestore = adminApp ? getFirestore(adminApp) : null;
export const adminStorage = adminApp ? getStorage(adminApp) : null;
