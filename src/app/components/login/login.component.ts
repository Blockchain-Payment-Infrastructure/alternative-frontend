import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  loginForm: FormGroup;
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  isLoading = signal(false);

  constructor() {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]]
    });
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.markFormGroupTouched(this.loginForm);
      return;
    }

    this.errorMessage.set(null);
    this.isLoading.set(true);

    const { email, password } = this.loginForm.value;

    this.authService.login({ email, password }).subscribe({
      next: () => {
        this.successMessage.set('Login successful! Redirecting...');
        this.router.navigate(['/']);
                setTimeout(() => {
            this.isLoading.set(false);
            this.successMessage.set(null);
            window.scrollTo(0, 0); // Scroll to the top
        }, 1000);
      },
      error: (error) => {
        this.isLoading.set(false);
        this.successMessage.set(null);
        
        // Check status code - if not 200 (OK) or 201 (Created), display error message
        const status = error?.status;
        let message: string | null = null;
        
        if (status && status !== 200 && status !== 201) {
          // Try to get error message from response headers first
          if (error?.headers) {
            message = error.headers.get('error') || 
                     error.headers.get('Error') ||
                     error.headers.get('X-Error-Message') ||
                     error.headers.get('x-error-message');
          }
          
          // If not in headers, try response body
          if (!message) {
            message = error?.error?.message || 
                     error?.error?.detail || 
                     error?.error?.error ||
                     error?.error?.msg ||
                     error?.message;
          }
          
          // Fallback message if nothing found
          this.errorMessage.set(message || 'Login failed. Please check your credentials.');
        } else {
          // For other errors (network, etc.)
          message = error?.error?.message || 
                   error?.error?.detail || 
                   error?.error?.error ||
                   error?.message ||
                   'Login failed. Please check your credentials.';
          this.errorMessage.set(message);
        }
      }
    });
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach((key) => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }
}

