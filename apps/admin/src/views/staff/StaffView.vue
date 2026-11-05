<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { Plus } from 'lucide-vue-next';
import {
  PERMISSIONS,
  type AdminRoleDetail,
  type AdminStaffMember,
  type Permission,
} from '@repo/shared-types';
import AppDialog from '@/components/ui/AppDialog.vue';
import ErrorNotice from '@/components/ui/ErrorNotice.vue';
import LoadingState from '@/components/ui/LoadingState.vue';
import PageHeader from '@/components/ui/PageHeader.vue';
import StatusBadge from '@/components/ui/StatusBadge.vue';
import { useAdminApi } from '@/composables/useAdminApi';
import { errorMessage, fieldErrors } from '@/lib/errors';
import { formatDate, formatDateTime } from '@/lib/format';
import { useAuthStore } from '@/stores/auth';

const api = useAdminApi();
const auth = useAuthStore();
const queryClient = useQueryClient();
const tab = ref<'staff' | 'roles'>('staff');
const staff = useQuery({
  queryKey: ['admin-staff'],
  queryFn: () => api.get<AdminStaffMember[]>('/staff'),
});
const roles = useQuery({
  queryKey: ['admin-roles'],
  queryFn: () => api.get<AdminRoleDetail[]>('/roles'),
});
const refresh = () =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: ['admin-staff'] }),
    queryClient.invalidateQueries({ queryKey: ['admin-roles'] }),
  ]);
const error = ref('');
const notice = ref('');
const fields = ref<Record<string, string>>({});
const fail = (e: unknown) => {
  error.value = errorMessage(e);
  fields.value = fieldErrors(e);
};

/** Permissions grouped by area for the role editor: "orders:refund" → Orders → refund. */
const permissionGroups = computed(() => {
  const groups = new Map<string, Permission[]>();
  for (const p of PERMISSIONS) {
    const area = p.split(':')[0]!;
    groups.set(area, [...(groups.get(area) ?? []), p]);
  }
  return [...groups.entries()];
});

// ── Invite / edit staff ─────────────────────────────────────────────────────
const dialog = ref<'invite' | 'member' | 'role' | null>(null);
const invite = reactive({ email: '', firstName: '', lastName: '', roleIds: [] as string[] });
const member = ref<AdminStaffMember | null>(null);
const memberRoles = ref<string[]>([]);
function openInvite() {
  Object.assign(invite, { email: '', firstName: '', lastName: '', roleIds: [] });
  error.value = '';
  fields.value = {};
  dialog.value = 'invite';
}
function openMember(m: AdminStaffMember) {
  member.value = m;
  memberRoles.value = m.roles.map((r) => r.id);
  error.value = '';
  dialog.value = 'member';
}
const sendInvite = useMutation({
  mutationFn: () => api.post<AdminStaffMember>('/staff', invite),
  onSuccess: async (m) => {
    dialog.value = null;
    notice.value = `Invitation sent to ${m.email}.`;
    await refresh();
  },
  onError: fail,
});
const updateMember = useMutation({
  mutationFn: (body: { roleIds?: string[]; status?: 'ACTIVE' | 'SUSPENDED' }) =>
    api.put(`/staff/${member.value!.id}`, body),
  onSuccess: async () => {
    dialog.value = null;
    await refresh();
  },
  onError: fail,
});
const memberAction = useMutation({
  mutationFn: (action: 'resend-invite' | 'reset-mfa') =>
    api.post(`/staff/${member.value!.id}/${action}`),
  onSuccess: async (_d, action) => {
    dialog.value = null;
    notice.value =
      action === 'reset-mfa'
        ? 'Two-factor reset. They will set it up again at next sign-in.'
        : 'Invitation sent again.';
    await refresh();
  },
  onError: fail,
});

// ── Roles ───────────────────────────────────────────────────────────────────
const role = reactive({
  id: null as string | null,
  name: '',
  description: '',
  permissions: [] as Permission[],
  isSystem: false,
});
function openRole(r?: AdminRoleDetail) {
  Object.assign(
    role,
    r
      ? {
          id: r.id,
          name: r.name,
          description: r.description ?? '',
          permissions: [...r.permissions],
          isSystem: r.isSystem,
        }
      : { id: null, name: '', description: '', permissions: [], isSystem: false },
  );
  error.value = '';
  fields.value = {};
  dialog.value = 'role';
}
const saveRole = useMutation({
  mutationFn: () => {
    const body = {
      name: role.name,
      description: role.description || null,
      permissions: role.permissions,
    };
    return role.id ? api.put(`/roles/${role.id}`, body) : api.post('/roles', body);
  },
  onSuccess: async () => {
    dialog.value = null;
    await refresh();
  },
  onError: fail,
});
const deleteRole = useMutation({
  mutationFn: () => api.del(`/roles/${role.id}`),
  onSuccess: async () => {
    dialog.value = null;
    await refresh();
  },
  onError: fail,
});
</script>

<template>
  <div>
    <PageHeader
      title="Staff & roles"
      description="Everyone signs in with two-factor authentication. Changes take effect within a minute."
    >
      <button v-if="tab === 'staff'" type="button" class="btn btn-primary" @click="openInvite">
        <Plus class="size-4" aria-hidden="true" /> Invite staff
      </button>
      <button v-else type="button" class="btn btn-primary" @click="openRole()">
        <Plus class="size-4" aria-hidden="true" /> New role
      </button>
    </PageHeader>
    <div class="mb-4 inline-flex rounded-full border border-slate-200 bg-white p-1" role="tablist">
      <button
        v-for="t in ['staff', 'roles'] as const"
        :key="t"
        type="button"
        role="tab"
        :aria-selected="tab === t"
        :class="[
          'rounded-full px-4 py-1 text-sm font-medium',
          tab === t ? 'bg-navy-950 text-white' : 'text-ink-muted',
        ]"
        @click="tab = t"
      >
        {{ t === 'staff' ? 'Staff' : 'Roles' }}
      </button>
    </div>
    <p
      v-if="notice"
      role="status"
      class="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
    >
      {{ notice }}
    </p>

    <div v-if="tab === 'staff'" class="card overflow-hidden">
      <LoadingState v-if="staff.isPending.value" />
      <ErrorNotice
        v-else-if="staff.isError.value"
        class="m-4"
        :message="errorMessage(staff.error.value)"
      />
      <table v-else class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Roles</th>
            <th>Two-factor</th>
            <th>Last sign-in</th>
            <th>Status</th>
            <th class="sr-only">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in staff.data.value" :key="m.id">
            <td class="font-medium">
              {{ m.name
              }}<span class="block text-xs font-normal text-ink-muted">{{ m.email }}</span>
            </td>
            <td class="text-sm">{{ m.roles.map((r) => r.name).join(', ') }}</td>
            <td class="text-sm">
              {{ m.invitePending ? 'Invite pending' : m.mfaEnabled ? 'Set up' : 'At next sign-in' }}
            </td>
            <td class="text-sm text-ink-muted">{{ formatDateTime(m.lastLoginAt) }}</td>
            <td><StatusBadge :status="m.status" /></td>
            <td class="text-right">
              <button
                v-if="m.id !== auth.user?.id"
                type="button"
                class="btn btn-ghost !py-1"
                @click="openMember(m)"
              >
                Manage
              </button>
              <span v-else class="text-xs text-ink-muted">You</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <LoadingState v-if="roles.isPending.value" />
      <button
        v-for="r in roles.data.value"
        :key="r.id"
        type="button"
        class="card p-5 text-left hover:border-brand-blue"
        @click="openRole(r)"
      >
        <p class="font-semibold">
          {{ r.name }}
          <span
            v-if="r.isSystem"
            class="ml-1 rounded bg-slate-100 px-1.5 text-xs font-normal text-ink-muted"
            >built-in</span
          >
        </p>
        <p class="mt-1 text-sm text-ink-muted">
          {{ r.description ?? `${r.permissions.length} permissions` }}
        </p>
        <p class="mt-2 text-xs text-ink-muted">
          {{ r.staffCount }} staff · {{ r.permissions.length }} permissions
        </p>
      </button>
    </div>

    <AppDialog :open="dialog === 'invite'" title="Invite staff" @close="dialog = null">
      <form id="invite-form" class="space-y-4" @submit.prevent="sendInvite.mutate()">
        <ErrorNotice :message="error" />
        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label for="i-first" class="field-label">First name</label
            ><input id="i-first" v-model="invite.firstName" class="field-input" required />
          </div>
          <div>
            <label for="i-last" class="field-label">Last name</label
            ><input id="i-last" v-model="invite.lastName" class="field-input" required />
          </div>
        </div>
        <div>
          <label for="i-email" class="field-label">Work email</label>
          <input
            id="i-email"
            v-model="invite.email"
            type="email"
            class="field-input"
            required
            :aria-invalid="!!fields.email"
          />
          <p v-if="fields.email" class="mt-1 text-xs text-red-700">{{ fields.email }}</p>
        </div>
        <fieldset>
          <legend class="field-label">Roles</legend>
          <label
            v-for="r in roles.data.value"
            :key="r.id"
            class="flex items-center gap-2 py-1 text-sm"
          >
            <input v-model="invite.roleIds" type="checkbox" :value="r.id" /> {{ r.name }}
          </label>
          <p v-if="fields.roleIds" class="text-xs text-red-700">{{ fields.roleIds }}</p>
        </fieldset>
        <p class="text-xs text-ink-muted">
          They get an email with a link to set a password (valid 72 hours), then set up two-factor
          at first sign-in.
        </p>
      </form>
      <template #footer>
        <button type="button" class="btn btn-secondary" @click="dialog = null">Cancel</button>
        <button
          type="submit"
          form="invite-form"
          class="btn btn-primary"
          :disabled="sendInvite.isPending.value"
        >
          Send invitation
        </button>
      </template>
    </AppDialog>

    <AppDialog :open="dialog === 'member'" :title="member?.name ?? ''" @close="dialog = null">
      <div v-if="member" class="space-y-4">
        <ErrorNotice :message="error" />
        <p class="text-sm text-ink-muted">
          {{ member.email }} · added {{ formatDate(member.createdAt) }}
        </p>
        <fieldset>
          <legend class="field-label">Roles</legend>
          <label
            v-for="r in roles.data.value"
            :key="r.id"
            class="flex items-center gap-2 py-1 text-sm"
          >
            <input v-model="memberRoles" type="checkbox" :value="r.id" /> {{ r.name }}
          </label>
        </fieldset>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="updateMember.isPending.value || !memberRoles.length"
          @click="updateMember.mutate({ roleIds: memberRoles })"
        >
          Save roles
        </button>
        <div class="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <button
            v-if="member.invitePending"
            type="button"
            class="btn btn-secondary"
            @click="memberAction.mutate('resend-invite')"
          >
            Resend invitation
          </button>
          <button
            v-if="member.mfaEnabled"
            type="button"
            class="btn btn-secondary"
            @click="memberAction.mutate('reset-mfa')"
          >
            Reset two-factor
          </button>
          <button
            type="button"
            :class="['btn', member.status === 'SUSPENDED' ? 'btn-secondary' : 'btn-danger']"
            @click="
              updateMember.mutate({
                status: member.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED',
              })
            "
          >
            {{ member.status === 'SUSPENDED' ? 'Reactivate' : 'Suspend and sign out' }}
          </button>
        </div>
      </div>
    </AppDialog>

    <AppDialog
      :open="dialog === 'role'"
      :title="role.id ? role.name : 'New role'"
      wide
      @close="dialog = null"
    >
      <form id="role-form" class="space-y-4" @submit.prevent="saveRole.mutate()">
        <ErrorNotice :message="error" />
        <p v-if="role.isSystem" class="rounded-lg bg-slate-50 p-3 text-sm text-ink-muted">
          Built-in roles cannot be changed. Create a custom role to grant a different set of
          permissions.
        </p>
        <fieldset :disabled="role.isSystem" class="space-y-4">
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label for="r-name" class="field-label">Name</label
              ><input id="r-name" v-model="role.name" class="field-input" required minlength="2" />
            </div>
            <div>
              <label for="r-desc" class="field-label">Description</label
              ><input id="r-desc" v-model="role.description" class="field-input" maxlength="200" />
            </div>
          </div>
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <fieldset v-for="[area, perms] in permissionGroups" :key="area">
              <legend class="text-sm font-semibold capitalize">{{ area }}</legend>
              <label v-for="p in perms" :key="p" class="flex items-center gap-2 py-0.5 text-sm">
                <input v-model="role.permissions" type="checkbox" :value="p" />
                {{ p.split(':')[1] }}
              </label>
            </fieldset>
          </div>
        </fieldset>
      </form>
      <template #footer>
        <button
          v-if="role.id && !role.isSystem"
          type="button"
          class="btn btn-ghost mr-auto !text-red-700"
          @click="deleteRole.mutate()"
        >
          Delete role
        </button>
        <button type="button" class="btn btn-secondary" @click="dialog = null">Close</button>
        <button
          v-if="!role.isSystem"
          type="submit"
          form="role-form"
          class="btn btn-primary"
          :disabled="saveRole.isPending.value"
        >
          Save role
        </button>
      </template>
    </AppDialog>
  </div>
</template>
