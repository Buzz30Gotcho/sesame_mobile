import Stripe from 'stripe';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const stripe = new (Stripe as any)(process.env.STRIPE_SECRET_KEY || '') as Stripe;
