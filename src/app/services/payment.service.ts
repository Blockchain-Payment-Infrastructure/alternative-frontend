import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { Payment, PaymentIntentRequest } from '../types/payment';

@Injectable({
  providedIn: 'root'
})
export class PaymentService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  createPaymentIntent(payload: PaymentIntentRequest): Observable<any> {
    return this.http.post<{ message: string; payment: Payment }>(`${this.baseUrl}/payments`, payload);
  }

  getRecentPayments(): Observable<Payment[]> {
    return this.http
      .get<{ payments: Payment[] }>(`${this.baseUrl}/payments?page=1&page_size=10`)
      .pipe(
        map((response: { payments: Payment[] }) => response.payments || []),
        catchError(() => of([]))
      );
  }
}

