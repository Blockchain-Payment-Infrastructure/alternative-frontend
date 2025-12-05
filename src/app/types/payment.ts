export interface PaymentIntentRequest {
  to_address: string;
  amount: string;
  currency?: string;
  transaction_hash: string;
  description?: string;
}

export interface Payment {
  id: string;
  amount: string;
  currency: string;
  status: 'pending' | 'confirmed' | 'failed' | 'cancelled';
  to_address: string;
  from_address?: string;
  transaction_hash?: string;
  createdAt: string;
  confirmed_at?: string;
  description?: string;
}

