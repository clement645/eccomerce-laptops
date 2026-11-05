'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Loader2, Lock, Pencil, Smartphone, Wallet } from 'lucide-react';
import { ApiError } from '@repo/api-client';
import {
  KENYA_COUNTIES,
  type AddressDto,
  type CheckoutQuote,
  type PlaceOrderResponse,
} from '@repo/shared-types';
import { addressSchema, emailSchema, kenyanPhoneSchema } from '@repo/validation';
import { z } from 'zod';
import { CartLines } from '@/components/cart/cart-lines';
import { FormAlert, SelectField, SubmitButton, TextField } from '@/components/forms/fields';
import { useAuth } from '@/lib/auth/auth-context';
import { useCart, useResetCart, useShopperRequest } from '@/lib/cart/cart-context';
import { cn } from '@/lib/cn';
import { formatKes } from '@/lib/format';
import { routes } from '@/lib/routes';

const contactSchema = z.object({
  email: emailSchema,
  firstName: z.string().trim().min(1, 'Enter your first name').max(60),
  lastName: z.string().trim().min(1, 'Enter your last name').max(60),
  phone: kenyanPhoneSchema,
});
type ContactInput = z.input<typeof contactSchema>;
type Contact = z.output<typeof contactSchema>;

const deliveryAddressSchema = addressSchema.omit({ label: true, isDefault: true });
type AddressInput = z.input<typeof deliveryAddressSchema>;
type Address = z.output<typeof deliveryAddressSchema>;

type Step = 1 | 2 | 3 | 4 | 5;

function localPhone(phone: string) {
  return phone.startsWith('254') ? `0${phone.slice(3)}` : phone;
}

function StepSection({
  step,
  current,
  title,
  summary,
  onEdit,
  children,
}: {
  step: Step;
  current: Step;
  title: string;
  summary?: ReactNode;
  onEdit: () => void;
  children: ReactNode;
}) {
  const done = current > step;
  const active = current === step;
  return (
    <section
      aria-labelledby={`step-${step}`}
      className={cn(
        'rounded-2xl border bg-white p-5 shadow-card md:p-6',
        active ? 'border-primary-200' : 'border-line',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold',
            done
              ? 'bg-emerald-700 text-white'
              : active
                ? 'bg-primary-600 text-white'
                : 'bg-surface-sunken text-ink-subtle',
          )}
        >
          {done ? <Check aria-hidden className="size-4" /> : step}
        </span>
        <h2
          id={`step-${step}`}
          className={cn('flex-1 text-lg font-bold', !active && !done && 'text-ink-subtle')}
        >
          {title}
        </h2>
        {done && (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary-600"
          >
            <Pencil aria-hidden className="size-3.5" /> Edit
          </button>
        )}
      </div>
      {done && summary && <div className="mt-3 pl-11 text-sm text-ink-muted">{summary}</div>}
      {active && <div className="mt-5">{children}</div>}
    </section>
  );
}

export function CheckoutFlow() {
  const router = useRouter();
  const { status, user, request } = useAuth();
  const call = useShopperRequest();
  const resetCart = useResetCart();
  const { data: cart, isPending: cartLoading } = useCart();

  const [step, setStep] = useState<Step>(1);
  const [contact, setContact] = useState<Contact | null>(null);
  const [address, setAddress] = useState<{ id: string | null; value: Address } | null>(null);
  const [methodCode, setMethodCode] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'MPESA' | 'CASH_ON_DELIVERY' | null>(null);
  const [mpesaPhone, setMpesaPhone] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<ReactNode>('');
  // One key per checkout attempt makes "Place order" safe to retry. Created on first use, not during
  // render: random values cannot be part of the prerendered page.
  const idempotencyKey = useRef<string | null>(null);
  /** The code sent to the server for pricing; the server decides whether it applies. */
  const [couponCode, setCouponCode] = useState('');
  const [couponInput, setCouponInput] = useState('');

  const savedAddresses = useQuery({
    queryKey: ['addresses', user?.id],
    queryFn: () => request<AddressDto[]>('/account/addresses'),
    enabled: status === 'authenticated',
  });

  const quote = useQuery({
    queryKey: [
      'checkout-quote',
      address?.value.county,
      address?.value.town,
      methodCode,
      cart?.itemCount,
      cart?.subtotalMinor,
      couponCode,
    ],
    queryFn: () =>
      call<CheckoutQuote>('/checkout/quote', {
        method: 'POST',
        body: {
          county: address!.value.county,
          town: address!.value.town,
          shippingMethodCode: methodCode ?? undefined,
          couponCode: couponCode || undefined,
        },
      }),
    enabled: Boolean(address),
    placeholderData: (previous) => previous,
  });

  const contactForm = useForm<ContactInput>({ resolver: zodResolver(contactSchema) });
  useEffect(() => {
    if (user && !contactForm.formState.isDirty) {
      contactForm.reset({
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone ? localPhone(user.phone) : '',
      });
    }
  }, [user, contactForm]);

  const addressForm = useForm<AddressInput>({ resolver: zodResolver(deliveryAddressSchema) });

  const place = useMutation({
    mutationFn: () =>
      call<PlaceOrderResponse>('/checkout/orders', {
        method: 'POST',
        headers: { 'Idempotency-Key': (idempotencyKey.current ??= crypto.randomUUID()) },
        body: {
          contact,
          ...(address?.id ? { addressId: address.id } : { shippingAddress: address?.value }),
          shippingMethodCode: methodCode,
          paymentMethod,
          mpesaPhone: paymentMethod === 'MPESA' && mpesaPhone ? mpesaPhone : undefined,
          customerNote: note || undefined,
          expectedTotalMinor: quote.data?.totals?.totalMinor,
          // Only a code the server accepted for these totals.
          couponCode: quote.data?.coupon?.code,
        },
      }),
    onSuccess: async (result) => {
      await resetCart();
      const simulated =
        result.next.type === 'AWAIT_MPESA' && result.next.simulated ? '&simulated=1' : '';
      router.replace(
        `/checkout/confirmation?token=${encodeURIComponent(result.order.trackingToken)}${simulated}`,
      );
    },
    onError: async (err) => {
      if (err instanceof ApiError && err.code === 'COUPON_INVALID') {
        await quote.refetch();
        setError(`${err.message} The total has been updated without it.`);
      } else if (err instanceof ApiError && err.code === 'PRICE_CHANGED') {
        await quote.refetch();
        setError(
          'Prices or delivery charges changed since you started. Please review the new total and place your order again.',
        );
      } else if (
        err instanceof ApiError &&
        ['OUT_OF_STOCK', 'CART_CHANGED', 'CART_EMPTY'].includes(err.code)
      ) {
        await resetCart();
        setError(
          <>
            {err.message}{' '}
            <Link href={routes.cart} className="font-semibold underline">
              Review your cart
            </Link>
          </>,
        );
      } else {
        setError(
          err instanceof ApiError
            ? err.message
            : 'We could not place your order. Check your connection and try again.',
        );
      }
    },
  });

  const shippingOptions = quote.data?.shippingOptions ?? [];
  const selectedMethod = shippingOptions.find((o) => o.code === methodCode) ?? null;
  const paymentMethods = quote.data?.paymentMethods ?? [];
  const totals = quote.data?.totals ?? null;
  const reviewLines = useMemo(
    () => quote.data?.cart.lines ?? cart?.lines ?? [],
    [quote.data, cart],
  );

  if (status === 'loading' || cartLoading) {
    return (
      <p role="status" className="flex items-center gap-2 py-16 text-ink-muted">
        <Loader2 aria-hidden className="size-5 animate-spin" /> Loading checkout…
      </p>
    );
  }
  if (!cart || cart.lines.length === 0) {
    return (
      <div className="rounded-3xl border border-line bg-white px-6 py-16 text-center">
        <h2 className="text-xl font-bold">Your cart is empty</h2>
        <Link
          href={routes.shop}
          className="mt-6 inline-flex rounded-full bg-primary-600 px-6 py-3 text-sm font-semibold text-white"
        >
          Start shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        {status === 'anonymous' && step === 1 && (
          <FormAlert tone="info">
            Checking out as a guest.{' '}
            <Link href="/account/login?next=/checkout" className="font-semibold underline">
              Sign in
            </Link>{' '}
            to use saved addresses and see this order in your account.
          </FormAlert>
        )}

        <StepSection
          step={1}
          current={step}
          title="Contact details"
          onEdit={() => setStep(1)}
          summary={
            contact &&
            `${contact.firstName} ${contact.lastName} · ${contact.email} · ${localPhone(contact.phone)}`
          }
        >
          <form
            noValidate
            className="space-y-4"
            onSubmit={contactForm.handleSubmit((values) => {
              const parsed = contactSchema.parse(values);
              setContact(parsed);
              if (!mpesaPhone) setMpesaPhone(localPhone(parsed.phone));
              setStep(2);
            })}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="First name"
                autoComplete="given-name"
                error={contactForm.formState.errors.firstName?.message}
                {...contactForm.register('firstName')}
              />
              <TextField
                label="Last name"
                autoComplete="family-name"
                error={contactForm.formState.errors.lastName?.message}
                {...contactForm.register('lastName')}
              />
              <TextField
                label="Email address"
                type="email"
                autoComplete="email"
                hint="We'll send your order confirmation here."
                error={contactForm.formState.errors.email?.message}
                {...contactForm.register('email')}
              />
              <TextField
                label="Mobile number"
                type="tel"
                autoComplete="tel"
                placeholder="0712 345 678"
                hint="For delivery updates."
                error={contactForm.formState.errors.phone?.message}
                {...contactForm.register('phone')}
              />
            </div>
            <SubmitButton pending={false} className="sm:w-auto">
              Continue to delivery address
            </SubmitButton>
          </form>
        </StepSection>

        <StepSection
          step={2}
          current={step}
          title="Delivery address"
          onEdit={() => setStep(2)}
          summary={
            address &&
            `${address.value.recipientName}, ${[address.value.building, address.value.street].filter(Boolean).join(', ')}, ${address.value.town}, ${address.value.county}`
          }
        >
          {savedAddresses.data && savedAddresses.data.length > 0 && (
            <fieldset className="mb-5">
              <legend className="mb-2 text-sm font-semibold">Saved addresses</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {savedAddresses.data.map((saved) => (
                  <button
                    key={saved.id}
                    type="button"
                    onClick={() => {
                      setAddress({
                        id: saved.id,
                        value: {
                          recipientName: saved.recipientName,
                          phone: saved.phone,
                          county: saved.county as Address['county'],
                          town: saved.town,
                          street: saved.street,
                          building: saved.building ?? undefined,
                          landmark: saved.landmark ?? undefined,
                        },
                      });
                      setMethodCode(null);
                      setStep(3);
                    }}
                    className="rounded-xl border-2 border-line p-3 text-left text-sm transition hover:border-primary-400"
                  >
                    <span className="font-semibold">{saved.label || saved.recipientName}</span>
                    {saved.isDefault && (
                      <span className="ml-2 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-bold text-primary-700">
                        Default
                      </span>
                    )}
                    <span className="mt-1 block text-ink-muted">
                      {saved.street}, {saved.town}, {saved.county}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-4 text-sm font-semibold">Or deliver to a new address</p>
            </fieldset>
          )}
          <form
            noValidate
            className="space-y-4"
            onSubmit={addressForm.handleSubmit((values) => {
              setAddress({ id: null, value: deliveryAddressSchema.parse(values) });
              setMethodCode(null);
              setStep(3);
            })}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Recipient name"
                autoComplete="name"
                error={addressForm.formState.errors.recipientName?.message}
                {...addressForm.register('recipientName')}
              />
              <TextField
                label="Recipient mobile number"
                type="tel"
                placeholder="0712 345 678"
                error={addressForm.formState.errors.phone?.message}
                {...addressForm.register('phone')}
              />
              <SelectField
                label="County"
                options={KENYA_COUNTIES}
                placeholder="Select a county"
                error={addressForm.formState.errors.county?.message}
                {...addressForm.register('county')}
              />
              <TextField
                label="Town / area"
                autoComplete="address-level2"
                error={addressForm.formState.errors.town?.message}
                {...addressForm.register('town')}
              />
              <TextField
                label="Street / road"
                autoComplete="address-line1"
                error={addressForm.formState.errors.street?.message}
                {...addressForm.register('street')}
              />
              <TextField
                label="Building, floor, house no. (optional)"
                autoComplete="address-line2"
                {...addressForm.register('building')}
              />
              <TextField
                label="Landmark (optional)"
                placeholder="Opposite the Total petrol station"
                {...addressForm.register('landmark')}
              />
            </div>
            <SubmitButton pending={false} className="sm:w-auto">
              Continue to delivery options
            </SubmitButton>
          </form>
        </StepSection>

        <StepSection
          step={3}
          current={step}
          title="Delivery method"
          onEdit={() => setStep(3)}
          summary={
            selectedMethod &&
            `${selectedMethod.name} · ${selectedMethod.priceMinor === 0 ? 'Free' : formatKes(selectedMethod.priceMinor)}`
          }
        >
          {quote.isPending ? (
            <p role="status" className="text-sm text-ink-muted">
              Finding delivery options…
            </p>
          ) : shippingOptions.length === 0 ? (
            <FormAlert tone="error">
              We don&apos;t deliver to this area yet. Please choose another address.
            </FormAlert>
          ) : (
            <fieldset className="space-y-2">
              <legend className="sr-only">Delivery method</legend>
              {shippingOptions.map((option) => (
                <label
                  key={option.code}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4',
                    methodCode === option.code
                      ? 'border-primary-600 bg-primary-50'
                      : 'border-line hover:border-primary-200',
                  )}
                >
                  <input
                    type="radio"
                    name="shipping"
                    value={option.code}
                    checked={methodCode === option.code}
                    onChange={() => setMethodCode(option.code)}
                    className="accent-primary-600"
                  />
                  <span className="flex-1">
                    <span className="block font-semibold">{option.name}</span>
                    <span className="block text-sm text-ink-muted">
                      {option.etaMinDays === 0 ? 'Same day' : option.etaMinDays}
                      {option.etaMaxDays !== option.etaMinDays &&
                        `–${option.etaMaxDays}`} working {option.etaMaxDays === 1 ? 'day' : 'days'}
                      {option.freeAboveMinor !== null &&
                        option.priceMinor > 0 &&
                        ` · free over ${formatKes(option.freeAboveMinor)}`}
                    </span>
                  </span>
                  <span className="font-bold">
                    {option.priceMinor === 0 ? 'Free' : formatKes(option.priceMinor)}
                  </span>
                </label>
              ))}
              <button
                type="button"
                disabled={!methodCode}
                onClick={() => setStep(4)}
                className="mt-3 rounded-full bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-button disabled:opacity-50"
              >
                Continue to payment
              </button>
            </fieldset>
          )}
        </StepSection>

        <StepSection
          step={4}
          current={step}
          title="Payment"
          onEdit={() => setStep(4)}
          summary={
            paymentMethod === 'MPESA'
              ? `M-Pesa · ${mpesaPhone}`
              : paymentMethod === 'CASH_ON_DELIVERY'
                ? 'Cash on delivery'
                : null
          }
        >
          <fieldset className="space-y-2">
            <legend className="sr-only">Payment method</legend>
            {paymentMethods.map((option) => {
              const Icon = option.method === 'MPESA' ? Smartphone : Wallet;
              return (
                <label
                  key={option.method}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border-2 p-4',
                    !option.available
                      ? 'cursor-not-allowed border-line opacity-60'
                      : paymentMethod === option.method
                        ? 'cursor-pointer border-primary-600 bg-primary-50'
                        : 'cursor-pointer border-line hover:border-primary-200',
                  )}
                >
                  <input
                    type="radio"
                    name="payment"
                    disabled={!option.available}
                    checked={paymentMethod === option.method}
                    onChange={() => setPaymentMethod(option.method)}
                    className="mt-1 accent-primary-600"
                  />
                  <Icon aria-hidden className="mt-0.5 size-5 text-primary-600" />
                  <span className="flex-1">
                    <span className="block font-semibold">
                      {option.method === 'MPESA' ? 'M-Pesa' : 'Cash on delivery'}
                      {option.simulated && (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                          Test mode
                        </span>
                      )}
                    </span>
                    <span className="block text-sm text-ink-muted">
                      {option.reason ??
                        (option.method === 'MPESA'
                          ? "You'll get a prompt on your phone to enter your M-Pesa PIN."
                          : 'Pay the courier when your order arrives.')}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>
          {paymentMethod === 'MPESA' && (
            <div className="mt-4 max-w-xs">
              <TextField
                label="M-Pesa number"
                type="tel"
                value={mpesaPhone}
                onChange={(event) => setMpesaPhone(event.target.value)}
                hint="The phone that will receive the payment prompt."
              />
            </div>
          )}
          <button
            type="button"
            disabled={
              !paymentMethod ||
              (paymentMethod === 'MPESA' && !kenyanPhoneSchema.safeParse(mpesaPhone).success)
            }
            onClick={() => setStep(5)}
            className="mt-4 rounded-full bg-primary-600 px-6 py-3 text-sm font-semibold text-white shadow-button disabled:opacity-50"
          >
            Review order
          </button>
        </StepSection>

        <StepSection
          step={5}
          current={step}
          title="Review and place order"
          onEdit={() => setStep(5)}
        >
          <CartLines lines={reviewLines} />
          <div className="mt-4">
            <label htmlFor="order-note" className="mb-1.5 block text-sm font-semibold">
              Delivery note (optional)
            </label>
            <textarea
              id="order-note"
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              className="w-full rounded-xl border border-line px-4 py-2.5 text-sm focus:border-primary-400 focus:outline-none focus:ring-4 focus:ring-primary-100"
            />
          </div>
          {error && (
            <div className="mt-4">
              <FormAlert tone="error">{error}</FormAlert>
            </div>
          )}
          <button
            type="button"
            disabled={!totals || place.isPending || !quote.data?.cart.checkoutReady}
            onClick={() => {
              setError('');
              place.mutate();
            }}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary-600 px-6 py-3.5 font-semibold text-white shadow-button hover:bg-primary-700 disabled:opacity-60"
          >
            {place.isPending ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : (
              <Lock aria-hidden className="size-4" />
            )}
            {totals ? `Place order · ${formatKes(totals.totalMinor)}` : 'Place order'}
          </button>
          <p className="mt-2 text-center text-xs text-ink-subtle">
            By placing your order you agree to our terms of sale. Prices include VAT.
          </p>
        </StepSection>
      </div>

      <aside className="h-fit rounded-2xl border border-line bg-white p-5 shadow-card lg:sticky lg:top-32">
        <h2 className="text-lg font-bold">Order summary</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {reviewLines.map((line) => (
            <li key={line.variantId} className="flex justify-between gap-3">
              <span className="text-ink-muted">
                {line.quantity} × {line.productName}
              </span>
              <span className="shrink-0 font-medium">{formatKes(line.lineTotalMinor)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-muted">Subtotal</dt>
            <dd>{formatKes(totals?.subtotalMinor ?? cart.subtotalMinor)}</dd>
          </div>
          {totals && totals.discountMinor > 0 && (
            <div className="flex justify-between text-success">
              <dt>Discount{quote.data?.coupon ? ` (${quote.data.coupon.code})` : ''}</dt>
              <dd>−{formatKes(totals.discountMinor)}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-ink-muted">Delivery</dt>
            <dd>
              {totals
                ? totals.shippingMinor === 0
                  ? 'Free'
                  : formatKes(totals.shippingMinor)
                : 'Choose a delivery method'}
            </dd>
          </div>
          {totals && totals.roundingMinor > 0 && (
            <div className="flex justify-between">
              <dt className="text-ink-muted">Rounding</dt>
              <dd>{formatKes(totals.roundingMinor)}</dd>
            </div>
          )}
          <div className="flex justify-between pt-1 text-base font-bold">
            <dt>Total</dt>
            <dd>{totals ? formatKes(totals.totalMinor) : '-'}</dd>
          </div>
          {totals && (
            <div className="flex justify-between text-xs text-ink-subtle">
              <dt>Includes VAT</dt>
              <dd>{formatKes(totals.taxMinor)}</dd>
            </div>
          )}
        </dl>
        <form
          className="mt-4 border-t border-line pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            setCouponCode(couponInput.trim().toUpperCase());
          }}
        >
          <label htmlFor="coupon" className="text-sm font-semibold text-ink">
            Discount code
          </label>
          {quote.data?.coupon ? (
            <p className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <span>
                <strong>{quote.data.coupon.code}</strong> applied
                {quote.data.coupon.description ? ` · ${quote.data.coupon.description}` : ''}
              </span>
              <button
                type="button"
                className="font-semibold underline"
                onClick={() => {
                  setCouponCode('');
                  setCouponInput('');
                }}
              >
                Remove
              </button>
            </p>
          ) : (
            <>
              <div className="mt-2 flex gap-2">
                <input
                  id="coupon"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  autoCapitalize="characters"
                  autoComplete="off"
                  maxLength={32}
                  disabled={!address}
                  aria-describedby={quote.data?.couponError ? 'coupon-error' : 'coupon-hint'}
                  aria-invalid={quote.data?.couponError ? true : undefined}
                  className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2 text-sm uppercase focus:border-primary-400 focus:outline-none focus:ring-4 focus:ring-primary-100 disabled:bg-surface-sunken"
                />
                <button
                  type="submit"
                  disabled={!address || !couponInput.trim() || quote.isFetching}
                  className="rounded-xl border border-primary-600 px-4 text-sm font-semibold text-primary-600 hover:bg-primary-50 disabled:opacity-50"
                >
                  Apply
                </button>
              </div>
              {quote.data?.couponError && couponCode ? (
                <p
                  id="coupon-error"
                  role="alert"
                  className="mt-1.5 text-xs font-medium text-danger"
                >
                  {quote.data.couponError}
                </p>
              ) : (
                <p id="coupon-hint" className="mt-1.5 text-xs text-ink-subtle">
                  {address
                    ? 'Applied to the price of your items.'
                    : 'Enter your delivery address first.'}
                </p>
              )}
            </>
          )}
        </form>
      </aside>
    </div>
  );
}
