'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MapPin, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { KENYA_COUNTIES, type AddressDto } from '@repo/shared-types';
import { addressSchema } from '@repo/validation';
import type { z } from 'zod';
import {
  Checkbox,
  FormAlert,
  SelectField,
  SubmitButton,
  TextField,
} from '@/components/forms/fields';
import { useAuth } from '@/lib/auth/auth-context';
import { applyApiError } from '@/lib/auth/form-errors';
import { Panel } from './account-shell';

type AddressForm = z.input<typeof addressSchema>;
const FIELDS = [
  'label',
  'recipientName',
  'phone',
  'county',
  'town',
  'street',
  'building',
  'landmark',
] as const;

function localPhone(phone: string): string {
  return phone.startsWith('254') ? `0${phone.slice(3)}` : phone;
}

function AddressEditor({
  initial,
  onSaved,
  onCancel,
}: {
  initial: AddressDto | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { request } = useAuth();
  const [error, setFormError] = useState('');
  const { register, handleSubmit, setError, formState } = useForm<AddressForm>({
    resolver: zodResolver(addressSchema),
    defaultValues: initial
      ? {
          label: initial.label ?? '',
          recipientName: initial.recipientName,
          phone: localPhone(initial.phone),
          county: initial.county as AddressForm['county'],
          town: initial.town,
          street: initial.street,
          building: initial.building ?? '',
          landmark: initial.landmark ?? '',
          isDefault: initial.isDefault,
        }
      : { isDefault: false },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError('');
    try {
      await request(initial ? `/account/addresses/${initial.id}` : '/account/addresses', {
        method: initial ? 'PUT' : 'POST',
        body: values,
      });
      onSaved();
    } catch (err) {
      setFormError(applyApiError(err, setError, FIELDS));
    }
  });

  const e = formState.errors;
  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="space-y-4 rounded-2xl border border-primary-100 bg-primary-50/40 p-4 md:p-5"
    >
      <FormAlert tone="error">{error}</FormAlert>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Recipient name"
          autoComplete="name"
          error={e.recipientName?.message}
          {...register('recipientName')}
        />
        <TextField
          label="Mobile number"
          type="tel"
          autoComplete="tel"
          placeholder="0712 345 678"
          error={e.phone?.message}
          {...register('phone')}
        />
        <SelectField
          label="County"
          options={KENYA_COUNTIES}
          placeholder="Select a county"
          error={e.county?.message}
          {...register('county')}
        />
        <TextField
          label="Town / area"
          autoComplete="address-level2"
          error={e.town?.message}
          {...register('town')}
        />
        <TextField
          label="Street / road"
          autoComplete="address-line1"
          error={e.street?.message}
          {...register('street')}
        />
        <TextField
          label="Building, floor, house no. (optional)"
          autoComplete="address-line2"
          error={e.building?.message}
          {...register('building')}
        />
        <TextField
          label="Landmark (optional)"
          placeholder="Opposite the Total petrol station"
          error={e.landmark?.message}
          {...register('landmark')}
        />
        <TextField
          label="Label (optional)"
          placeholder="Home, Office…"
          error={e.label?.message}
          {...register('label')}
        />
      </div>
      {!initial?.isDefault && (
        <Checkbox label="Use as my default delivery address" {...register('isDefault')} />
      )}
      <div className="flex flex-wrap gap-3">
        <SubmitButton pending={formState.isSubmitting} className="w-auto">
          {initial ? 'Save address' : 'Add address'}
        </SubmitButton>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-line bg-white px-6 py-3 text-sm font-semibold text-ink hover:border-primary-200"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function AddressesPanel() {
  const { request } = useAuth();
  const [addresses, setAddresses] = useState<AddressDto[] | null>(null);
  const [editing, setEditing] = useState<AddressDto | 'new' | null>(null);
  const [error, setError] = useState('');

  const load = () =>
    request<AddressDto[]>('/account/addresses')
      .then(setAddresses)
      .catch(() => setError('Could not load your addresses.'));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = async (path: string, method: 'POST' | 'DELETE') => {
    setError('');
    try {
      await request(path, { method });
      await load();
    } catch {
      setError('That change could not be saved. Please try again.');
    }
  };

  return (
    <Panel title="Delivery addresses" description="Save up to 10 addresses for faster checkout.">
      <FormAlert tone="error">{error}</FormAlert>
      {addresses === null ? (
        <p role="status" className="text-sm text-ink-muted">
          Loading…
        </p>
      ) : (
        <div className="space-y-4">
          {addresses.length === 0 && editing === null && (
            <p className="text-sm text-ink-muted">You haven&apos;t saved any addresses yet.</p>
          )}
          <ul className="grid gap-4 md:grid-cols-2">
            {addresses.map((address) =>
              editing !== 'new' && editing?.id === address.id ? null : (
                <li key={address.id} className="relative rounded-2xl border border-line p-4">
                  <p className="flex items-center gap-2 font-semibold text-ink">
                    <MapPin aria-hidden className="size-4 text-primary-600" />
                    {address.label || address.recipientName}
                    {address.isDefault && (
                      <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-bold text-primary-700">
                        Default
                      </span>
                    )}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-ink-muted">
                    {address.recipientName} · {localPhone(address.phone)}
                    <br />
                    {[address.building, address.street].filter(Boolean).join(', ')}
                    <br />
                    {address.town}, {address.county}
                    {address.landmark && (
                      <>
                        <br />
                        Near {address.landmark}
                      </>
                    )}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold">
                    <button
                      type="button"
                      onClick={() => setEditing(address)}
                      className="inline-flex items-center gap-1 text-primary-600"
                    >
                      <Pencil aria-hidden className="size-3.5" /> Edit
                    </button>
                    {!address.isDefault && (
                      <button
                        type="button"
                        onClick={() => act(`/account/addresses/${address.id}/default`, 'POST')}
                        className="inline-flex items-center gap-1 text-primary-600"
                      >
                        <Star aria-hidden className="size-3.5" /> Make default
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('Delete this address?'))
                          void act(`/account/addresses/${address.id}`, 'DELETE');
                      }}
                      className="inline-flex items-center gap-1 text-danger"
                    >
                      <Trash2 aria-hidden className="size-3.5" /> Delete
                    </button>
                  </div>
                </li>
              ),
            )}
          </ul>
          {editing !== null ? (
            <AddressEditor
              key={editing === 'new' ? 'new' : editing.id}
              initial={editing === 'new' ? null : editing}
              onCancel={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                void load();
              }}
            />
          ) : (
            addresses.length < 10 && (
              <button
                type="button"
                onClick={() => setEditing('new')}
                className="inline-flex items-center gap-2 rounded-full border-2 border-dashed border-primary-200 px-5 py-2.5 text-sm font-semibold text-primary-600 hover:border-primary-400"
              >
                <Plus aria-hidden className="size-4" /> Add an address
              </button>
            )
          )}
        </div>
      )}
    </Panel>
  );
}
