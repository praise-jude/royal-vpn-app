// Korapay checkout. The server sets the price and confirms every payment with Korapay;
// the app only starts checkout and then asks the server whether it went through.
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { api, type User } from './api';

export type VerifyResult = { paid: boolean; user: User };

export async function verifyPayment(reference: string): Promise<VerifyResult> {
  return api<VerifyResult>(`/payments/verify/${encodeURIComponent(reference)}`);
}

// Web: leaves the page for Korapay and returns to /payment-complete (see readReturnedPayment).
// Phones: opens Korapay in an in-app browser and confirms when it's closed. Returns null on web (page navigates away).
export async function startCheckout(planId: string): Promise<VerifyResult | null> {
  const { checkoutUrl, reference } = await api<{ checkoutUrl: string; reference: string }>('/payments/initialize', {
    method: 'POST',
    body: { planId },
  });
  if (Platform.OS === 'web') {
    window.location.assign(checkoutUrl);
    return null;
  }
  await WebBrowser.openBrowserAsync(checkoutUrl);
  // Korapay can take a moment to confirm after the customer closes the page.
  for (let i = 0; i < 3; i++) {
    const r = await verifyPayment(reference);
    if (r.paid) return r;
    await new Promise((res) => setTimeout(res, 2000));
  }
  return verifyPayment(reference);
}

// Web only: the payment reference when Korapay has just sent the visitor back, then the URL is tidied up.
export function readReturnedPayment(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const { pathname, search } = window.location;
  if (pathname !== '/payment-complete') return null;
  const reference = new URLSearchParams(search).get('reference');
  try { window.history.replaceState(null, '', '/'); } catch { /* old browser */ }
  return reference;
}
