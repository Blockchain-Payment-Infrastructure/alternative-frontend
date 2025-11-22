import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './signup.component.html',
  styleUrl: './signup.component.scss'
})
export class SignupComponent {
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  signupForm: FormGroup;
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);
  isLoading = signal(false);

  constructor() {
    this.signupForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      username: ['', [Validators.required, Validators.minLength(3)]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      phone_number: ['', [Validators.required, Validators.pattern(/^\d{10}$/)]]
    });
  }

  onSubmit(): void {
    if (this.signupForm.invalid) {
      this.markFormGroupTouched(this.signupForm);
      return;
    }

    this.errorMessage.set(null);
    this.isLoading.set(true);

    const formValue = this.signupForm.value;

    this.authService.signUp(formValue).subscribe({
      next: () => {
        this.successMessage.set('Account created successfully! Logging you in...');
        // After successful signup, automatically log in
        this.authService.login({
          email: formValue.email,
          password: formValue.password
        }).subscribe({
          next: () => {
            this.successMessage.set('Welcome! Redirecting to home page...');
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
              this.errorMessage.set(message || 'Account created but login failed. Please try logging in.');
            } else {
              // For other errors (network, etc.)
              message = error?.error?.message || 
                       error?.error?.detail || 
                       error?.error?.error ||
                       error?.message ||
                       'Account created but login failed. Please try logging in.';
              this.errorMessage.set(message);
            }
          }
        });
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
          this.errorMessage.set(message || 'Signup failed. Please try again.');
        } else {
          // For other errors (network, etc.)
          message = error?.error?.message || 
                   error?.error?.detail || 
                   error?.error?.error ||
                   error?.message ||
                   'Signup failed. Please try again.';
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

