<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import {
  Boxes,
  ClipboardList,
  FolderTree,
  Image,
  Inbox,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  Mail,
  Menu,
  Newspaper,
  Package,
  ScrollText,
  Settings,
  ShieldCheck,
  Star,
  Tags,
  TicketPercent,
  Users,
  X,
} from 'lucide-vue-next';
import type { Permission } from '@repo/shared-types';
import { useAuthStore } from '@/stores/auth';

const sections: {
  title: string;
  items: { name: string; to: string; icon: unknown; permission: Permission }[];
}[] = [
  {
    title: '',
    items: [
      { name: 'Dashboard', to: 'dashboard', icon: LayoutDashboard, permission: 'dashboard:read' },
      { name: 'Orders', to: 'orders', icon: ClipboardList, permission: 'orders:read' },
      { name: 'Customers', to: 'customers', icon: Users, permission: 'customers:read' },
      { name: 'Reviews', to: 'reviews', icon: Star, permission: 'reviews:moderate' },
      { name: 'Messages', to: 'messages', icon: Inbox, permission: 'customers:read' },
    ],
  },
  {
    title: 'Catalog',
    items: [
      { name: 'Products', to: 'products', icon: Package, permission: 'products:read' },
      { name: 'Categories', to: 'categories', icon: FolderTree, permission: 'products:read' },
      { name: 'Brands', to: 'brands', icon: Tags, permission: 'products:read' },
      { name: 'Inventory', to: 'inventory', icon: Boxes, permission: 'inventory:read' },
    ],
  },
  {
    title: 'Storefront',
    items: [
      { name: 'Banners', to: 'banners', icon: Image, permission: 'content:write' },
      { name: 'Homepage', to: 'homepage', icon: LayoutTemplate, permission: 'content:write' },
      { name: 'Blog', to: 'blog', icon: Newspaper, permission: 'blog:write' },
    ],
  },
  {
    title: 'Marketing',
    items: [
      { name: 'Coupons', to: 'coupons', icon: TicketPercent, permission: 'coupons:write' },
      { name: 'Newsletter', to: 'newsletter', icon: Mail, permission: 'customers:read' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { name: 'Store settings', to: 'settings', icon: Settings, permission: 'settings:write' },
      { name: 'Staff & roles', to: 'staff', icon: ShieldCheck, permission: 'staff:manage' },
      { name: 'Audit log', to: 'audit', icon: ScrollText, permission: 'audit:read' },
    ],
  },
];
const sidebarOpen = ref(false);
const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
/** Section pages stay highlighted on their detail pages (e.g. Orders on /orders/EL-…). */
const isActive = (name: string) =>
  name === 'dashboard'
    ? route.path === '/'
    : route.path === `/${name}` || route.path.startsWith(`/${name}/`);
// Only show what this staff member can open. The API enforces permissions regardless.
const navigation = computed(() =>
  sections
    .map((s) => ({ ...s, items: s.items.filter((i) => auth.can(i.permission)) }))
    .filter((s) => s.items.length > 0),
);

async function signOut() {
  await auth.logout();
  await router.replace({ name: 'login' });
}
</script>

<template>
  <div class="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr] lg:bg-navy-950">
    <aside
      :class="[
        'fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-navy-950 text-white transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
      ]"
      aria-label="Main navigation"
    >
      <div class="flex h-16 items-center justify-between px-5">
        <span class="flex items-center gap-2 font-bold tracking-tight">
          <img src="/favicon.svg" alt="" class="size-8" />
          Store Admin
        </span>
        <button
          type="button"
          class="rounded-lg p-2 text-white/70 hover:bg-white/10 lg:hidden"
          aria-label="Close navigation"
          @click="sidebarOpen = false"
        >
          <X class="size-5" aria-hidden="true" />
        </button>
      </div>
      <nav class="mt-2 space-y-5 overflow-y-auto px-3 pb-6">
        <div v-for="section in navigation" :key="section.title">
          <p
            v-if="section.title"
            class="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-white/60"
          >
            {{ section.title }}
          </p>
          <RouterLink
            v-for="item in section.items"
            :key="item.name"
            :to="{ name: item.to }"
            class="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-white/70 transition hover:bg-white/5 hover:text-white"
            :class="isActive(item.to) && 'bg-white/10 !text-white'"
            :aria-current="isActive(item.to) ? 'page' : undefined"
            @click="sidebarOpen = false"
          >
            <component :is="item.icon" class="size-[1.1rem]" aria-hidden="true" />
            {{ item.name }}
          </RouterLink>
        </div>
      </nav>
    </aside>

    <div
      v-if="sidebarOpen"
      class="fixed inset-0 z-30 bg-navy-950/50 lg:hidden"
      aria-hidden="true"
      @click="sidebarOpen = false"
    />

    <div class="flex min-h-dvh min-w-0 flex-col bg-slate-50">
      <header
        class="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur md:px-6"
      >
        <button
          type="button"
          class="rounded-lg p-2 text-ink-muted hover:bg-slate-100 lg:hidden"
          aria-label="Open navigation"
          @click="sidebarOpen = true"
        >
          <Menu class="size-5" aria-hidden="true" />
        </button>
        <h1 class="text-lg font-semibold">{{ $route.meta.title }}</h1>
        <div v-if="auth.user" class="ml-auto flex items-center gap-3">
          <span class="hidden text-right text-sm sm:block">
            <span class="block font-semibold">{{ auth.user.name }}</span>
            <span class="block text-xs text-ink-muted">{{ auth.user.roles.join(', ') }}</span>
          </span>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
            @click="signOut"
          >
            <LogOut class="size-4" aria-hidden="true" /> Sign out
          </button>
        </div>
      </header>
      <main id="main" class="flex-1 bg-slate-50/60 p-4 md:p-6">
        <RouterView />
      </main>
    </div>
  </div>
</template>
