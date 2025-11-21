import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal, effect } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterOutlet, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Payment } from './types/payment';
import { WalletService } from './services/wallet.service';
import { PaymentService } from './services/payment.service';
import { AuthService } from './services/auth.service';

interface WalletSnapshot {
  connected: boolean;
  address?: string;
  networkName?: string;
  chainId?: string;
  balance?: string;
}

interface ToastMessage {
  id: number;
  tone: 'success' | 'error' | 'info';
  text: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, ReactiveFormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class AppComponent {
  private readonly fb = inject(FormBuilder);
  private readonly walletService = inject(WalletService);
  private readonly paymentService = inject(PaymentService);
  protected readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);


  readonly features = [
    {
      title: 'Secure blockchain payments',
      body: 'Send payments directly on the blockchain with instant confirmation and transparent transaction history.'
    },
    {
      title: 'Phone number lookup',
      body: 'Easily find wallet addresses by searching with phone numbers for quick and convenient payments.'
    },
    {
      title: 'Real-time transaction tracking',
      body: 'Monitor your payment status in real-time with instant updates when transactions are confirmed or failed.'
    }
  ];

  readonly workflow = [
    { title: 'Connect wallet', body: 'Link your MetaMask wallet to your account to start sending payments.' },
    { title: 'Enter payment details', body: 'Specify the amount, recipient wallet address, or search by phone number.' },
    { title: 'Confirm transaction', body: 'Sign the transaction in MetaMask and wait for blockchain confirmation.' }
  ];

  walletState = signal<WalletSnapshot>({
    connected: false,
    balance: '0.0000',
    networkName: 'Not connected'
  });

  payments = signal<Payment[]>([]);
  connectingWallet = signal(false);
  submittingPayment = signal(false);
  notifications = signal<ToastMessage[]>([]);
  
  // Phone number search
  phoneSearchQuery = signal('');
  phoneSearchResults = signal<{ address: string }[]>([]);
  searchingPhone = signal(false);
  showPhoneResults = signal(false);

  readonly paymentForm = this.fb.nonNullable.group({
    amount: [0.25, [Validators.required, Validators.min(0.0001)]],
    currency: ['USDC', [Validators.required]],
    recipientWallet: ['', [Validators.required, Validators.minLength(6)]],
    phoneSearch: [''], // For phone number search
    reference: [''],
    memo: ['']
  });

  readonly isMetaMaskMissing = computed(() => !this.walletService.isMetaMaskInstalled);
  readonly isAuthenticated = computed(() => this.authService.isAuthenticated());

  private readonly demoPayments: Payment[] = [
    {
      id: 'demo-1',
      amount: '2.4',
      currency: 'ETH',
      status: 'confirmed',
      to_address: '0x9F57...21B3',
      transaction_hash: '0x53fe7c...',
      createdAt: new Date().toISOString()
    },
    {
      id: 'demo-2',
      amount: '1800',
      currency: 'USDC',
      status: 'pending',
      to_address: '0xa6e0...19C1',
      createdAt: new Date(Date.now() - 1000 * 60 * 20).toISOString()
    },
    {
      id: 'demo-3',
      amount: '0.84',
      currency: 'ETH',
      status: 'failed',
      to_address: '0x317b...4C99',
      createdAt: new Date(Date.now() - 1000 * 60 * 55).toISOString()
    }
  ];

  constructor() {
    // Check for existing wallets when authenticated - but don't auto-connect
    effect(() => {
      if (this.isAuthenticated()) {
        // Small delay to ensure token is fully set
        setTimeout(() => {
          this.checkUserWalletStatus();
        }, 100);
      } else {
        // Clear wallet state on logout
        this.walletState.set({
          connected: false,
          balance: '0.0000',
          networkName: 'Not connected'
        });
      }
    });

    this.loadRecentPayments();
    
    // Watch for phone number search changes
    this.paymentForm.get('phoneSearch')?.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        if (value) {
          this.searchWalletByPhone(value);
        } else {
          this.phoneSearchResults.set([]);
          this.showPhoneResults.set(false);
        }
      });
    
    this.walletService.onAccountChange((accounts) => {
      if (!accounts.length) {
        this.walletState.set({
          connected: false,
          balance: '0.0000',
          networkName: 'Wallet disconnected'
        });
        this.pushToast('info', 'Wallet disconnected');
        return;
      }

      this.refreshWallet(accounts[0]);
    });

    this.walletService.onChainChange((chainId) => {
      const current = this.walletState();
      if (!current.address) {
        return;
      }

      this.walletState.set({ ...current, chainId });
      this.pushToast('info', `Network changed to ${chainId}`);
      this.refreshWallet(current.address);
    });
  }

  private async checkUserWalletStatus(): Promise<void> {
    if (!this.isAuthenticated()) {
      // Clear wallet state when not authenticated
      this.walletState.set({
        connected: false,
        balance: '0.0000',
        networkName: 'Not connected'
      });
      return;
    }

    // Ensure we have a token before making authenticated requests
    const token = this.authService.getAccessToken();
    if (!token) {
      console.warn('User is authenticated but no token found');
      return;
    }

    // ALWAYS clear wallet state on login - force user to reconnect their own wallet
    // This ensures each account connects their own unique wallet
    this.walletState.set({
      connected: false,
      balance: '0.0000',
      networkName: 'Not connected'
    });

    // Don't check existing wallets - force user to connect fresh each time
    // This ensures they select the correct account in MetaMask
    setTimeout(() => {
      this.pushToast('info', 'Please connect your MetaMask wallet. Make sure to select the correct account in MetaMask.');
    }, 500);
  }

  async connectWallet(): Promise<void> {
    if (!this.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }

    // Check if MetaMask is installed
    if (!this.walletService.isMetaMaskInstalled) {
      this.pushToast('error', 'MetaMask is not installed. Please install MetaMask to continue.');
      window.open('https://metamask.io/download/', '_blank');
      return;
    }

    this.connectingWallet.set(true);
    try {
      // Always force account selection - this will show MetaMask account picker
      // This ensures each user selects their own account
      const connection = await this.walletService.connectWallet(true);
      
      // Verify we got a valid address
      if (!connection.address || connection.address.length !== 42) {
        this.pushToast('error', 'Invalid wallet address. Please try connecting again.');
        this.connectingWallet.set(false);
        return;
      }
      
      // Check if wallet is already linked to this user's account
      let walletsResponse;
      try {
        walletsResponse = await this.walletService.getUserWallets().toPromise();
      } catch (e) {
        // User might not have any wallets yet
        walletsResponse = { wallets: [] };
      }
      
      const isLinkedToThisUser = walletsResponse?.wallets.some(
        w => w.address.toLowerCase() === connection.address.toLowerCase()
      );

      if (!isLinkedToThisUser) {
        // Need to link wallet with signature - but first check if it's linked to another account
        const message = `Connect wallet to your account\n\nAddress: ${connection.address}\nTimestamp: ${Date.now()}`;
        
        try {
          await this.walletService.connectWalletWithSignature(message, connection.address);
          this.pushToast('success', 'Wallet successfully linked to your account!');
        } catch (linkError: any) {
          // Check if wallet is already linked to another account
          if (linkError?.status === 409 || linkError?.error?.message?.includes('already linked')) {
            this.pushToast('error', 'This wallet is already linked to another account. Please use a different wallet address or contact support.');
          } else {
            const errorMsg = linkError?.error?.message || linkError?.message || 'Failed to link wallet. Please try again.';
            this.pushToast('error', errorMsg);
          }
          this.connectingWallet.set(false);
          return;
        }
      } else {
        this.pushToast('success', 'Wallet already linked to your account');
      }

      const balance = await this.walletService.getBalance(connection.address);
      this.walletState.set({
        connected: true,
        address: connection.address,
        chainId: connection.chainId,
        networkName: connection.networkName,
        balance
      });
    } catch (error: any) {
      if (error?.code === 4001) {
        // User rejected the request
        this.pushToast('info', 'Wallet connection was rejected. Please connect your wallet to continue.');
      } else {
        this.pushToast('error', error?.message ?? 'Unable to connect MetaMask. Please try again.');
      }
    } finally {
      this.connectingWallet.set(false);
    }
  }

  logout(): void {
    // Clear all payment polling intervals
    this.paymentPollingIntervals.forEach((intervalId) => {
      clearInterval(intervalId);
    });
    this.paymentPollingIntervals.clear();

    // Disconnect wallet before logout
    this.walletService.disconnectWallet().catch(() => {
      // Ignore errors - MetaMask may not support disconnect
    });

    this.authService.logout().subscribe({
      next: () => {
        this.walletState.set({
          connected: false,
          balance: '0.0000',
          networkName: 'Not connected'
        });
        this.router.navigate(['/login']);
      },
      error: () => {
        // Clear state even if logout request fails
        this.walletState.set({
          connected: false,
          balance: '0.0000',
          networkName: 'Not connected'
        });
        this.router.navigate(['/login']);
      }
    });
  }

  async submitPayment(): Promise<void> {
    if (this.paymentForm.invalid) {
      this.paymentForm.markAllAsTouched();
      this.pushToast('error', 'Please complete the payment details');
      return;
    }

    if (!this.walletState().connected) {
      this.pushToast('error', 'Connect your MetaMask wallet before sending payments');
      return;
    }

    this.submittingPayment.set(true);
    const payload = this.paymentForm.getRawValue();
    const walletAddress = this.walletState().address!;

    // First, create a pending payment record
    const pendingPayment: Payment = {
      id: `pending-${Date.now()}`,
      amount: payload.amount.toString(),
      currency: payload.currency || 'ETH',
      status: 'pending',
      to_address: payload.recipientWallet,
      from_address: walletAddress,
      createdAt: new Date().toISOString()
    };
    this.payments.update((existing) => [pendingPayment, ...existing].slice(0, 10));

    try {
      // Check balance before sending
      const provider = (window as any).ethereum;
      if (!provider) {
        this.pushToast('error', 'MetaMask is not available');
        this.updatePaymentStatus(pendingPayment.id, 'failed', 'MetaMask not available');
        this.submittingPayment.set(false);
        return;
      }

      // Convert amount to Wei (needed for both balance check and transaction)
      const amountInWeiHex = this.convertToWei(payload.amount.toString(), payload.currency);
      
      // Check balance - but don't fail if check fails, let MetaMask handle it
      try {
        const balanceHex = await provider.request({
          method: 'eth_getBalance',
          params: [walletAddress, 'latest']
        });
        
        // Parse hex string to BigInt (remove 0x prefix if present)
        const balanceHexClean = balanceHex.startsWith('0x') ? balanceHex.slice(2) : balanceHex;
        const balanceWei = BigInt('0x' + balanceHexClean);
        
        // Remove '0x' prefix if present for BigInt parsing
        const amountInWei = BigInt(amountInWeiHex.startsWith('0x') ? amountInWeiHex.slice(2) : amountInWeiHex);
        
        // Estimate gas (rough estimate)
        const gasEstimate = BigInt('21000'); // 21000 for simple transfer
        const gasPriceHex = await provider.request({ method: 'eth_gasPrice' });
        const gasPriceHexClean = gasPriceHex.startsWith('0x') ? gasPriceHex.slice(2) : gasPriceHex;
        const gasPrice = BigInt('0x' + gasPriceHexClean);
        const totalNeeded = amountInWei + (gasEstimate * gasPrice);

        if (balanceWei < totalNeeded) {
          this.updatePaymentStatus(pendingPayment.id, 'failed', 'Insufficient balance');
          this.pushToast('error', 'Insufficient balance. Please add more funds to your wallet.');
          this.submittingPayment.set(false);
          return;
        }
      } catch (balanceError) {
        // If balance check fails, log but continue - MetaMask will handle the actual transaction
        console.warn('Balance check failed, proceeding with transaction:', balanceError);
      }

      // Send transaction via MetaMask
      let txHash: string;
      try {
        txHash = await provider.request({
          method: 'eth_sendTransaction',
          params: [{
            from: walletAddress,
            to: payload.recipientWallet,
            value: amountInWeiHex,
            gas: '0x5208', // 21000 gas limit for simple transfer
          }]
        });
      } catch (txError: any) {
        // User rejected or transaction failed
        if (txError.code === 4001) {
          // User didn't sign - mark as failed
          this.updatePaymentStatus(pendingPayment.id, 'failed', 'Transaction rejected by user');
          this.pushToast('error', 'Transaction was rejected. Please try again.');
        } else {
          this.updatePaymentStatus(pendingPayment.id, 'failed', txError.message || 'Transaction failed');
          this.pushToast('error', txError.message || 'Transaction failed');
        }
        this.submittingPayment.set(false);
        return;
      }

      // Update payment with transaction hash (still pending until confirmed)
      this.updatePaymentStatus(pendingPayment.id, 'pending', undefined, txHash);
      this.pushToast('info', 'Transaction signed. Waiting for confirmation...');

      // Wait for transaction to be mined and confirmed
      let receipt: any;
      let attempts = 0;
      const maxAttempts = 60; // Wait up to 5 minutes (60 * 5 seconds)
      
      while (attempts < maxAttempts) {
        try {
          receipt = await provider.request({
            method: 'eth_getTransactionReceipt',
            params: [txHash]
          });
          
          if (receipt) {
            // Transaction has been mined
            break;
          }
        } catch (error) {
          console.warn('Error checking transaction receipt:', error);
        }
        
        // Wait 5 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 5000));
        attempts++;
      }

      // Check if transaction was successful and store status
      let transactionConfirmed = false;
      let transactionFailed = false;
      
      if (!receipt) {
        // Transaction not confirmed within timeout
        this.updatePaymentStatus(pendingPayment.id, 'pending', 'Transaction pending confirmation');
        this.pushToast('info', 'Transaction submitted but confirmation is taking longer than expected. It will be confirmed shortly.');
      } else {
        // Check transaction status (status: '0x1' = success, '0x0' = failed)
        const isSuccess = receipt.status === '0x1' || receipt.status === '0x01' || receipt.status === 1;
        
        if (isSuccess) {
          // Transaction confirmed successfully
          transactionConfirmed = true;
          this.updatePaymentStatus(pendingPayment.id, 'confirmed', undefined, txHash);
          this.pushToast('success', 'Transaction confirmed successfully!');
        } else {
          // Transaction failed (e.g., reverted)
          transactionFailed = true;
          this.updatePaymentStatus(pendingPayment.id, 'failed', 'Transaction reverted on blockchain');
          this.pushToast('error', 'Transaction failed on blockchain. Please check your balance and try again.');
          this.submittingPayment.set(false);
          return;
        }
      }

      // Now send to backend with transaction hash
      this.paymentService
        .createPaymentIntent({
          to_address: payload.recipientWallet,
          amount: payload.amount.toString(),
          currency: payload.currency || 'ETH',
          transaction_hash: txHash,
          description: payload.memo ? `${payload.reference ? `Ref: ${payload.reference}. ` : ''}${payload.memo}` : payload.reference || undefined
        })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (response: any) => {
            // Backend returns { message: "...", payment: {...} }
            const payment = response.payment || response;
            // Use confirmed status if transaction was confirmed, otherwise use backend status
            const finalStatus = transactionConfirmed 
              ? 'confirmed' 
              : (payment.status || 'pending');
            
            // Update the payment with backend data, preserving confirmed status if already confirmed
            this.payments.update((existing) => 
              existing.map(p => 
                p.id === pendingPayment.id 
                  ? { 
                      ...payment, 
                      status: finalStatus,
                      transaction_hash: txHash,
                      confirmed_at: finalStatus === 'confirmed' ? new Date().toISOString() : payment.confirmed_at
                    }
                  : p
              )
            );
            
            this.paymentForm.reset({
              amount: 0.25,
              currency: 'USDC',
              recipientWallet: '',
              reference: '',
              memo: '',
              phoneSearch: ''
            });
            
            // Reload payments to get updated status from backend
            this.loadRecentPayments();
            
            // Start polling for transaction status updates if still pending
            const finalPaymentId = payment.id || pendingPayment.id;
            if (finalStatus === 'pending') {
              this.startPaymentStatusPolling(finalPaymentId, txHash);
            }
          },
          error: (err) => {
            console.error(err);
            // If transaction was already confirmed, keep it as confirmed even if backend fails
            const currentPayment = this.payments().find(p => p.id === pendingPayment.id);
            if (currentPayment && currentPayment.status === 'confirmed') {
              // Transaction is confirmed, backend sync can happen later
              this.pushToast('info', 'Transaction confirmed. Backend sync pending.');
            } else {
              // Keep as pending if backend fails but transaction was sent
              this.updatePaymentStatus(pendingPayment.id, 'pending', 'Backend verification pending');
              this.pushToast(
                'info',
                'Transaction sent but backend verification pending. Check transaction status later.'
              );
            }
            this.submittingPayment.set(false);
          },
          complete: () => this.submittingPayment.set(false)
        });
    } catch (error: any) {
      console.error('Transaction error:', error);
      this.updatePaymentStatus(pendingPayment.id, 'failed', error?.message || 'Transaction failed');
      this.pushToast('error', error?.message ?? 'Transaction was rejected or failed');
      this.submittingPayment.set(false);
    }
  }

  private updatePaymentStatus(paymentId: string, status: Payment['status'], errorMessage?: string, txHash?: string): void {
    this.payments.update((existing) =>
      existing.map(p =>
        p.id === paymentId
          ? {
              ...p,
              status,
              transaction_hash: txHash || p.transaction_hash,
              ...(errorMessage && status === 'failed' ? { description: errorMessage } : {})
            }
          : p
      )
    );
  }

  private paymentPollingIntervals = new Map<string, number>();

  private startPaymentStatusPolling(paymentId: string, txHash: string): void {
    // Clear any existing polling for this payment
    const existingInterval = this.paymentPollingIntervals.get(paymentId);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    let pollCount = 0;
    const maxPolls = 30; // Poll for up to 5 minutes (30 * 10 seconds)

    const intervalId = window.setInterval(() => {
      pollCount++;
      
      // Also check blockchain directly for confirmation
      const provider = (window as any).ethereum;
      if (provider && txHash) {
        provider.request({
          method: 'eth_getTransactionReceipt',
          params: [txHash]
        }).then((receipt: any) => {
          if (receipt) {
            const isSuccess = receipt.status === '0x1' || receipt.status === '0x01' || receipt.status === 1;
            if (isSuccess) {
              // Update payment status to confirmed
              this.payments.update((existing) =>
                existing.map(p =>
                  (p.id === paymentId || p.transaction_hash === txHash)
                    ? { ...p, status: 'confirmed' as const, confirmed_at: new Date().toISOString() }
                    : p
                )
              );
              clearInterval(intervalId);
              this.paymentPollingIntervals.delete(paymentId);
              this.pushToast('success', 'Transaction confirmed on blockchain!');
            } else {
              // Transaction failed
              this.payments.update((existing) =>
                existing.map(p =>
                  (p.id === paymentId || p.transaction_hash === txHash)
                    ? { ...p, status: 'failed' as const }
                    : p
                )
              );
              clearInterval(intervalId);
              this.paymentPollingIntervals.delete(paymentId);
              this.pushToast('error', 'Transaction failed on blockchain');
            }
          }
        }).catch(() => {
          // Ignore errors, will check via backend
        });
      }
      
      // Reload payments to get updated status from backend
      this.paymentService
        .getRecentPayments()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (items) => {
            if (items.length > 0) {
              // Merge payments, preserving any local confirmed status
              this.payments.update((existing) => {
                const merged = [...items];
                
                // Check if payment status changed
                const payment = items.find(p => p.id === paymentId || p.transaction_hash === txHash);
                if (payment && payment.status !== 'pending') {
                  // Payment status updated, stop polling
                  clearInterval(intervalId);
                  this.paymentPollingIntervals.delete(paymentId);
                  
                  // Update local payment with backend status
                  this.payments.update((existing) =>
                    existing.map(p =>
                      (p.id === paymentId || p.transaction_hash === txHash)
                        ? { ...payment, status: payment.status }
                        : p
                    )
                  );
                  
                  if (payment.status === 'confirmed') {
                    this.pushToast('success', 'Transaction confirmed!');
                  } else if (payment.status === 'failed') {
                    this.pushToast('error', 'Transaction failed');
                  }
                } else if (pollCount >= maxPolls) {
                  // Stop polling after max attempts
                  clearInterval(intervalId);
                  this.paymentPollingIntervals.delete(paymentId);
                }
                
                return merged
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .slice(0, 10);
              });
            } else if (pollCount >= maxPolls) {
              // Stop polling after max attempts
              clearInterval(intervalId);
              this.paymentPollingIntervals.delete(paymentId);
            }
          },
          error: (error) => {
            console.error('Failed to load payments during polling:', error);
            if (pollCount >= maxPolls) {
              clearInterval(intervalId);
              this.paymentPollingIntervals.delete(paymentId);
            }
          }
        });
    }, 10000); // Poll every 10 seconds

    this.paymentPollingIntervals.set(paymentId, intervalId);
  }

  private convertToWei(amount: string, currency: string): string {
    // For ETH, convert to Wei (1 ETH = 10^18 Wei)
    // For other currencies, you might need different conversion
    if (currency === 'ETH') {
      const amountBigInt = BigInt(Math.floor(parseFloat(amount) * 1e18));
      return '0x' + amountBigInt.toString(16);
    }
    // For ERC20 tokens, you'd need to call the token contract
    // For now, assuming ETH
    const amountBigInt = BigInt(Math.floor(parseFloat(amount) * 1e18));
    return '0x' + amountBigInt.toString(16);
  }

  protected loadRecentPayments(): void {
    if (!this.isAuthenticated()) {
      // Show demo payments if not authenticated
      this.payments.set(this.demoPayments);
      return;
    }
    
    this.paymentService
      .getRecentPayments()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          if (items.length > 0) {
            // Merge with existing payments to preserve any local updates
            // Backend payments take precedence, but we merge by transaction hash or ID
            this.payments.update((existing) => {
              const merged = [...items];
              
              // Add any local pending payments that aren't in the backend response yet
              existing.forEach(existingPayment => {
                const existsInBackend = items.some(
                  item => item.id === existingPayment.id || 
                  (item.transaction_hash && item.transaction_hash === existingPayment.transaction_hash)
                );
                
                if (!existsInBackend && existingPayment.status === 'pending') {
                  // Keep local pending payments that haven't been synced to backend yet
                  merged.unshift(existingPayment);
                }
              });
              
              // Sort by creation date, most recent first
              return merged
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, 10);
            });
          } else {
            // If backend returns empty, keep existing payments (might be local pending ones)
            // Only clear if we have no existing payments
            if (this.payments().length === 0) {
              this.payments.set([]);
            }
          }
        },
        error: (error) => {
          console.error('Failed to load payments:', error);
          // Keep existing payments on error
        }
      });
  }

  private async refreshWallet(address: string): Promise<void> {
    try {
      const balance = await this.walletService.getBalance(address);
      const snapshot = this.walletState();
      this.walletState.set({ ...snapshot, connected: true, address, balance });
    } catch (error) {
      this.pushToast('error', (error as Error).message ?? 'Unable to refresh wallet');
    }
  }

  protected formatAddress(value?: string): string {
    if (!value) {
      return '—';
    }
    return `${value.slice(0, 6)}...${value.slice(-4)}`;
  }

  protected statusClass(status: Payment['status']): string {
    const statusMap: Record<Payment['status'], string> = {
      confirmed: 'status-pill success',
      pending: 'status-pill warning',
      failed: 'status-pill danger',
      cancelled: 'status-pill danger'
    };
    return statusMap[status] || 'status-pill';
  }

  private pushToast(tone: ToastMessage['tone'], text: string): void {
    const toast: ToastMessage = { id: Date.now(), tone, text };
    this.notifications.update((list) => [toast, ...list].slice(0, 3));
    setTimeout(() => this.dismissToast(toast.id), 6000);
  }

  dismissToast(id: number): void {
    this.notifications.update((list) => list.filter((toast) => toast.id !== id));
  }

  searchWalletByPhone(phoneNumber: string): void {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    
    // Only search if we have exactly 10 digits
    if (cleanPhone.length !== 10) {
      this.phoneSearchResults.set([]);
      this.showPhoneResults.set(false);
      return;
    }

    this.searchingPhone.set(true);
    this.showPhoneResults.set(true);

    this.walletService.getWalletAddressesByPhone(cleanPhone)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (addresses) => {
          // Show all wallet addresses linked to the searched phone number
          this.phoneSearchResults.set(addresses);
          this.searchingPhone.set(false);
          
          if (addresses.length === 0) {
            this.pushToast('info', 'No wallet addresses found for this phone number');
          } else if (addresses.length === 1) {
            // If there's exactly one address, automatically fill it in
            this.selectWalletAddress(addresses[0].address);
          } else {
            // If there are multiple addresses, show dropdown but auto-fill the first one
            this.paymentForm.patchValue({
              recipientWallet: addresses[0].address
            });
            this.pushToast('info', `Found ${addresses.length} wallet addresses. First one auto-filled. Click to see others.`);
          }
        },
        error: (error) => {
          console.error('Phone search error:', error);
          this.phoneSearchResults.set([]);
          this.searchingPhone.set(false);
          if (error?.status !== 400) {
            this.pushToast('error', error?.error?.message || 'Failed to search wallet addresses');
          }
        }
      });
  }

  selectWalletAddress(address: string): void {
    // Fill in the recipient wallet field with the selected address
    this.paymentForm.patchValue({
      recipientWallet: address,
      phoneSearch: '' // Clear phone search field
    });
    this.phoneSearchResults.set([]);
    this.showPhoneResults.set(false);
    this.pushToast('success', 'Wallet address filled in');
  }

  hidePhoneResults(): void {
    setTimeout(() => {
      this.showPhoneResults.set(false);
    }, 200);
  }

  showPhoneResultsIfAvailable(): void {
    if (this.phoneSearchResults().length > 0) {
      this.showPhoneResults.set(true);
    }
  }
}
