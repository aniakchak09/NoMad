import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { AngularFireDatabase } from '@angular/fire/compat/database';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  mode: 'login' | 'signup' = 'login';

  email = '';
  password = '';
  username = '';

  error: string | null = null;
  loading = false;

  constructor(
    private afAuth: AngularFireAuth,
    private db: AngularFireDatabase,
    private router: Router
  ) {}

  toggleMode(): void {
    this.mode = this.mode === 'login' ? 'signup' : 'login';
    this.error = null;
  }

  async submit(): Promise<void> {
    this.error = null;
    this.loading = true;

    try {
      const email = this.email.trim();
      const password = this.password;

      if (this.mode === 'login') {
        // This line is correct as it uses the UI-provided email and password
        const cred = await this.afAuth.signInWithEmailAndPassword(email, password); 
        
        if (!cred.user?.uid) throw new Error('Nu am primit UID.');
        
        await this.router.navigateByUrl('/home'); 
        return;
      }

      // ===== SIGN UP =====
      const usernameRaw = this.username.trim();
      const usernameKey = usernameRaw.toLowerCase();

      if (!usernameKey) {
        this.error = 'Username este obligatoriu.';
        return;
      }

      // 1) Verificare username duplicat (RTDB)
      // folosim o citire "o singura data" (get)
      const snap = await this.db.object(`usernames/${usernameKey}`).query.get();
      if (snap.exists()) {
        this.error = 'Username-ul este deja folosit. Alege altul.';
        return;
      }

      // 2) Creare user in Firebase Auth (email duplicat -> va arunca auth/email-already-in-use)
      const cred = await this.afAuth.createUserWithEmailAndPassword(email, password);
      const uid = cred.user?.uid;
      if (!uid) throw new Error('Nu am primit UID.');

      // 3) Salvare user in RTDB + index username -> uid
      await this.db.object(`users/${uid}`).set({
        userId: uid,
        email,
        name: usernameRaw,   // salvam username ca name
        role: 'USER'
      });

      await this.db.object(`usernames/${usernameKey}`).set(uid);

      await this.router.navigateByUrl('/home'); // sau '/map'
    } catch (e: any) {
      const code = e?.code || '';

      if (code === 'auth/email-already-in-use') {
        this.error = 'Există deja un cont cu acest email.';
      } else if (code === 'auth/invalid-email') {
        this.error = 'Email invalid.';
      } else if (code === 'auth/weak-password') {
        this.error = 'Parola prea slabă (minim 6 caractere).';
      } else {
        this.error = e?.message ?? 'Eroare necunoscută la autentificare.';
      }
    } finally {
      this.loading = false;
    }
  }
}
