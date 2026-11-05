import type { PublicStoreSettings } from '@repo/shared-types';
import Link from 'next/link';

export function AnnouncementBar({
  announcement,
}: {
  announcement: PublicStoreSettings['announcement'];
}) {
  if (!announcement?.enabled || announcement.messages.length === 0) return null;
  const content = (
    <ul className="flex items-center justify-center gap-x-3 gap-y-1">
      {announcement.messages.map((message, index) => (
        <li
          key={message}
          className={index > 0 ? 'hidden items-center gap-3 sm:flex' : 'flex items-center gap-3'}
        >
          {index > 0 && <span aria-hidden className="size-1 rounded-full bg-primary-400" />}
          {message}
        </li>
      ))}
    </ul>
  );
  return (
    <div className="bg-navy-950 text-xs font-medium text-white/85">
      <div className="container-page py-2">
        {announcement.href ? (
          <Link href={announcement.href} className="block hover:text-white">
            {content}
          </Link>
        ) : (
          content
        )}
      </div>
    </div>
  );
}
