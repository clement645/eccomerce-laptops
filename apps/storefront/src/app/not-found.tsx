import { ButtonLink } from '@/components/ui/button-link';
import { DeviceArt } from '@/components/illustrations/device-art';

export default function NotFound() {
  return (
    <main
      id="main"
      className="container-page flex flex-1 flex-col items-center justify-center py-20 text-center"
    >
      <DeviceArt kind="laptops" idPrefix="not-found" accent={2} className="w-56" />
      <p className="mt-6 text-sm font-semibold text-primary-600">404</p>
      <h1 className="mt-2 text-3xl font-extrabold">This page isn’t available yet</h1>
      <p className="mt-3 max-w-md text-ink-muted">
        The page may have moved, or it’s still being built. Let’s get you back to the store.
      </p>
      <ButtonLink href="/" className="mt-8" arrow>
        Back to home
      </ButtonLink>
    </main>
  );
}
