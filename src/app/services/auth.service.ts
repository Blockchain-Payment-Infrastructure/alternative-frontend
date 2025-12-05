import { inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { environment } from '../../environments/environment';

export interface SignUpRequest {
  email: string;
  username: string;
  password: string;
  phone_number: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  message: string;
  access_token: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  accessToken: string | null;
  userEmail: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;
  private readonly TOKEN_KEY = 'access_token';
  private readonly EMAIL_KEY = 'user_email';

  // Reactive state
  authState = signal<AuthState>({
    isAuthenticated: false,
    accessToken: null,
    userEmail: null
  });

  constructor() {
    // Restore auth state from localStorage on service init
    this.restoreAuthState();
  }

  signUp(payload: SignUpRequest): Observable<{ result: string }> {
    return this.http.post<{ result: string }>(`${this.baseUrl}/auth/signup`, payload);
  }

  login(payload: LoginRequest): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${this.baseUrl}/auth/login`, payload, { withCredentials: true })
      .pipe(
        tap((response) => {
          // Store access token and email
          localStorage.setItem(this.TOKEN_KEY, response.access_token);
          localStorage.setItem(this.EMAIL_KEY, payload.email);
          
          // Update reactive state
          this.authState.set({
            isAuthenticated: true,
            accessToken: response.access_token,
            userEmail: payload.email
          });
        }),
        catchError((error) => {
          console.error('Login error:', error);
          return throwError(() => error);
        })
      );
  }

  logout(): Observable<{ message: string }> {
    return this.http
      .post<{ message: string }>(`${this.baseUrl}/auth/logout`, {}, { withCredentials: true })
      .pipe(
        tap(() => {
          this.clearAuthState();
        }),
        catchError((error) => {
          // Clear state even if logout request fails
          this.clearAuthState();
          return throwError(() => error);
        })
      );
  }

  refreshToken(): Observable<{ access_token: string }> {
    return this.http
      .post<{ access_token: string }>(`${this.baseUrl}/auth/refresh`, {}, { withCredentials: true })
      .pipe(
        tap((response) => {
          localStorage.setItem(this.TOKEN_KEY, response.access_token);
          this.authState.update((state) => ({
            ...state,
            accessToken: response.access_token
          }));
        })
      );
  }

  getAccessToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  isAuthenticated(): boolean {
    return this.authState().isAuthenticated;
  }

  private restoreAuthState(): void {
    const token = localStorage.getItem(this.TOKEN_KEY);
    const email = localStorage.getItem(this.EMAIL_KEY);

    if (token) {
      this.authState.set({
        isAuthenticated: true,
        accessToken: token,
        userEmail: email
      });
    }
  }

  private clearAuthState(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.EMAIL_KEY);
    this.authState.set({
      isAuthenticated: false,
      accessToken: null,
      userEmail: null
    });
  }

  // Account management methods
  changePassword(payload: { old_password: string; new_password: string }): Observable<{ message: string }> {
    const token = this.getAccessToken();
    if (!token) {
      return throwError(() => new Error('Missing authentication token'));
    }
    const headers = { 'Authorization': `Bearer ${token}` };
    return this.http.patch<{ message: string }>(`${this.baseUrl}/account/change-password`, payload, { headers });
  }

  updateEmail(payload: { new_email: string; password: string }): Observable<{ message: string }> {
    const token = this.getAccessToken();
    if (!token) {
      return throwError(() => new Error('Missing authentication token'));
    }
    const headers = { 'Authorization': `Bearer ${token}` };
    return this.http.patch<{ message: string }>(`${this.baseUrl}/account/update-email`, payload, { headers });
  }

  deleteAccount(payload: { password: string }): Observable<{ message: string }> {
    const token = this.getAccessToken();
    if (!token) {
      return throwError(() => new Error('Missing authentication token'));
    }
    const headers = { 'Authorization': `Bearer ${token}` };
    return this.http.request<{ message: string }>('delete', `${this.baseUrl}/account/delete`, { body: payload, headers });
  }
}

