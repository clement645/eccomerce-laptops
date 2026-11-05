import { routes } from '@/lib/routes';

export interface NavLink {
  label: string;
  href: string;
  menu?: 'categories' | 'brands';
}

export const NAV_LINKS: NavLink[] = [
  { label: 'Home', href: routes.home },
  { label: 'Shop', href: routes.shop, menu: 'categories' },
  { label: 'Laptops', href: routes.category('laptops') },
  { label: 'Desktops', href: routes.category('desktops') },
  { label: 'Gaming', href: routes.category('gaming') },
  { label: 'Accessories', href: routes.category('accessories') },
  { label: 'Brands', href: routes.brands, menu: 'brands' },
  { label: 'Deals', href: routes.deals },
  { label: 'Blog', href: routes.blog },
  { label: 'Contact', href: routes.contact },
];
