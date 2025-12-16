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

    async testSignUp() {
    const email = 'demo_admin@test.com';
    const password = 'parola123';

    try {
      const result = await this.auth.createUserWithEmailAndPassword(email, password);
      const uid = result.user?.uid;

      if (!uid) {
        console.error('Nu am primit UID de la Firebase');
        return;
      }

      console.log('User creat in Auth cu uid =', uid);

      // 1. User in DB
      await this.db.object('users/' + uid).set({
        userId: uid,
        email,
        name: 'Demo Admin',
        role: 'ADMIN'
      });

      console.log('User salvat in Realtime Database la users/' + uid);

      // 2. Itinerar mock in DB
      const itineraryId = 'it_mock_2';

      await this.db.object('itineraries/' + itineraryId).set({
        itineraryId,
        userId: uid,
        cityId: 'city2',
        days: 4,
        totalCost: 550,
        schedule: {
          day1: ['poi4', 'poi5'],
          day2: ['poi6'],
          day3: ['poi7', 'poi8'],
          day4: ['poi9']
        }
      });

      console.log('Itinerar salvat in Realtime Database la itineraries/' + itineraryId);

    } catch (err) {
      console.error('Eroare la testSignUp:', err);
    }
  }

  async testLogin(): Promise<void> {
  const email = 'demo@test.com';
  const password = 'parola123';

  try {
    const result = await this.auth.signInWithEmailAndPassword(email, password);
    console.log('User logat (TEST):', result.user?.uid);
  } catch (err) {
    console.error('Eroare la testLogin:', err);
  }
}

}
