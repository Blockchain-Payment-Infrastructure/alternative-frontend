import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';

export interface WalletConnection {
  address: string;
  chainId: string;
  networkName: string;
}

export interface UserWallet {
  address: string;
  balance_wei: string;
  balance_eth: string;
  formatted: string;
}

export interface UserWalletsResponse {
  wallets: UserWallet[];
  total_balance: string;
  wallet_count: number;
}

type EthereumProvider = {
  isMetaMask?: boolean;
  request<T = unknown>(args: { method: string; params?: unknown[] }): Promise<T>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
};

const NETWORK_MAP: Record<string, string> = {
  '0x1': 'Ethereum Mainnet',
  '0x5': 'Goerli Testnet',
  '0xaa36a7': 'Sepolia Testnet',
  '0x89': 'Polygon Mainnet',
  '0x13881': 'Polygon Mumbai',
  '0xa4b1': 'Arbitrum One',
  '0xa': 'Optimism'
};

@Injectable({
  providedIn: 'root'
})
export class WalletService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;
  private readonly WALLET_ADDRESS_KEY = 'walletAddress';

  private get provider(): EthereumProvider | undefined {
    return typeof window !== 'undefined'
      ? (window as unknown as { ethereum?: EthereumProvider }).ethereum
      : undefined;
  }

  get isMetaMaskInstalled(): boolean {
    return Boolean(this.provider?.isMetaMask ?? this.provider);
  }

  async connectWallet(forceAccountSelection: boolean = true): Promise<WalletConnection> {
    const provider = this.ensureProvider();
    
    let accounts: string[] = [];
    
    if (forceAccountSelection) {
      // Force account selection by requesting permissions - this will show account picker
      try {
        await provider.request({
          method: 'wallet_requestPermissions',
          params: [{ eth_accounts: {} }]
        });
      } catch (e: any) {
        // If user rejects, throw error
        if (e.code === 4001) {
          throw new Error('Account selection was rejected. Please select an account to continue.');
        }
      }
    }

    // Request accounts - this will return the selected account
    accounts = await provider.request<string[]>({ method: 'eth_requestAccounts' });
    
    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts selected. Please select an account in MetaMask.');
    }

    const chainId = await provider.request<string>({ method: 'eth_chainId' });
    const address = accounts[0];

    // Persist wallet address to localStorage
    this.persistWalletAddress(address);

    return {
      address,
      chainId,
      networkName: NETWORK_MAP[chainId?.toLowerCase() ?? ''] ?? 'Unknown Network'
    };
  }

  async disconnectWallet(): Promise<void> {
    const provider = this.provider;
    if (!provider) {
      return;
    }

    // Try to disconnect - MetaMask doesn't have a standard disconnect method
    // but we can clear the connection by requesting permissions again
    try {
      // Request permissions with empty params to potentially reset connection
      await provider.request({
        method: 'wallet_requestPermissions',
        params: []
      });
    } catch (e) {
      // Ignore errors - MetaMask may not support this
    }

    // Clear persisted wallet address
    this.clearPersistedWalletAddress();
  }

  async connectWalletWithSignature(message: string, address: string): Promise<{ success: boolean; walletAddress: string; message: string }> {
    const provider = this.ensureProvider();
    
    // Request signature from MetaMask
    const signature = await provider.request<string>({
      method: 'personal_sign',
      params: [message, address]
    });

    // Send to backend for verification and linking
    return this.http
      .post<{ success: boolean; walletAddress: string; message: string }>(`${this.baseUrl}/wallet/connect`, {
        message,
        signature
      })
      .toPromise()
      .then((response) => {
        if (!response) {
          throw new Error('No response from server');
        }
        return response;
      });
  }

  getUserWallets(): Observable<UserWalletsResponse> {
    return this.http.get<UserWalletsResponse>(`${this.baseUrl}/wallet/balances`);
  }

  getWalletAddressesByPhone(phoneNumber: string): Observable<{ address: string }[]> {
    // Remove any non-digit characters and ensure 10 digits
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      throw new Error('Phone number must be exactly 10 digits');
    }
    return this.http.get<{ address: string }[]>(`${this.baseUrl}/wallet/addresses/${cleanPhone}`);
  }

  async getBalance(address: string): Promise<string> {
    const provider = this.ensureProvider();
    const balanceHex = await provider.request<string>({
      method: 'eth_getBalance',
      params: [address, 'latest']
    });

    return this.formatEther(balanceHex);
  }

  onAccountChange(handler: (accounts: string[]) => void): void {
    this.provider?.on?.('accountsChanged', (...args: unknown[]) => {
      handler((args[0] as string[]) ?? []);
    });
  }

  onChainChange(handler: (chainId: string) => void): void {
    this.provider?.on?.('chainChanged', (...args: unknown[]) => {
      handler((args[0] as string) ?? '');
    });
  }

  private ensureProvider(): EthereumProvider {
    const provider = this.provider;
    if (!provider) {
      throw new Error('MetaMask was not detected. Please install or enable it in your browser.');
    }

    return provider;
  }

  private formatEther(value: string): string {
    if (!value) {
      return '0';
    }

    const wei = BigInt(value);
    const etherInteger = wei / 10n ** 18n;
    const remainder = wei % 10n ** 18n;
    const fraction = remainder.toString().padStart(18, '0').slice(0, 4);

    return `${etherInteger}.${fraction}`.replace(/\.$/, '');
  }

  // Wallet address persistence methods
  persistWalletAddress(address: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.WALLET_ADDRESS_KEY, address);
    }
  }

  getPersistedWalletAddress(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(this.WALLET_ADDRESS_KEY);
    }
    return null;
  }

  clearPersistedWalletAddress(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.WALLET_ADDRESS_KEY);
    }
  }
}

