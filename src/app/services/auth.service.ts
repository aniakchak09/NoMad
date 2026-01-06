// auth.service.ts
import { Injectable } from '@angular/core';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFireDatabase } from '@angular/fire/compat/database';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  constructor(
    private auth: AngularFireAuth,
    private db: AngularFireDatabase
  ) {}

  // NEW: Real Login Method
  async login(email: string, password: string) {
    return await this.auth.signInWithEmailAndPassword(email, password);
  }

  // NEW: Real Sign Up Method
  async signUp(email: string, password: string, username: string) {
    const result = await this.auth.createUserWithEmailAndPassword(email, password);
    const uid = result.user?.uid;

    if (uid) {
      // Save user profile to RTDB
      await this.db.object(`users/${uid}`).set({
        userId: uid,
        email: email,
        name: username,
        role: 'USER'
      });
      // Index username for uniqueness checks
      await this.db.object(`usernames/${username.toLowerCase()}`).set(uid);
    }
    return result;
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
  }
}