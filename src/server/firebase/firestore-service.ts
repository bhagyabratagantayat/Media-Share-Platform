import { adminFirestore, adminAuth } from '@/lib/firebase/admin';

export interface FirestoreUser {
  id: string;
  name: string;
  email: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  isPlatformAdmin: boolean;
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface FirestoreOrganisation {
  id: string;
  name: string;
  slug: string;
  type: string;
  city?: string | null;
  logoUrl?: string | null;
  storageQuotaBytes: number;
  usedStorageBytes: number;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
}

/**
 * Saves or updates a user document in Firestore.
 */
export async function saveUserToFirestore(userData: {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  isPlatformAdmin?: boolean;
}): Promise<FirestoreUser> {
  const userRecord: FirestoreUser = {
    id: userData.id,
    name: userData.name,
    email: userData.email.toLowerCase().trim(),
    status: 'ACTIVE',
    isPlatformAdmin: !!userData.isPlatformAdmin,
    avatarUrl: userData.avatarUrl || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (adminFirestore) {
    try {
      await adminFirestore.collection('users').doc(userData.id).set(userRecord, { merge: true });
    } catch (err) {
      console.warn('[Firestore] Error saving user record:', err);
    }
  }

  return userRecord;
}

/**
 * Retrieves a user document by ID from Firestore.
 */
export async function getUserFromFirestore(id: string): Promise<FirestoreUser | null> {
  if (!adminFirestore) return null;
  try {
    const doc = await adminFirestore.collection('users').doc(id).get();
    if (!doc.exists) return null;
    return doc.data() as FirestoreUser;
  } catch (err) {
    console.warn('[Firestore] Error fetching user by ID:', err);
    return null;
  }
}

/**
 * Retrieves a user document by email from Firestore.
 */
export async function getUserByEmailFromFirestore(email: string): Promise<FirestoreUser | null> {
  if (!adminFirestore) return null;
  try {
    const snapshot = await adminFirestore
      .collection('users')
      .where('email', '==', email.toLowerCase().trim())
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    return snapshot.docs[0].data() as FirestoreUser;
  } catch (err) {
    console.warn('[Firestore] Error fetching user by email:', err);
    return null;
  }
}
