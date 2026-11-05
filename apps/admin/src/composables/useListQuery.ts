import { computed, reactive, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

/**
 * List filters mirrored in the URL, so a filtered view can be bookmarked or shared and survives
 * reloads. Changing any filter returns to page 1.
 */
export function useListQuery<T extends Record<string, string>>(defaults: T) {
  const route = useRoute();
  const router = useRouter();
  const read = () =>
    Object.fromEntries(
      Object.keys(defaults).map((k) => [
        k,
        typeof route.query[k] === 'string' ? (route.query[k] as string) : defaults[k],
      ]),
    ) as T;
  const filters = reactive(read()) as T;
  const page = computed(() => Math.max(1, Number(route.query.page) || 1));

  watch(
    () => ({ ...filters }),
    (next) => {
      const query = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== ''));
      void router.replace({ query });
    },
  );
  watch(
    () => route.query,
    () => Object.assign(filters, read()),
  );

  const setPage = (p: number) => router.replace({ query: { ...route.query, page: String(p) } });
  /** Filters plus page, without empty values, ready to send to the API. */
  const params = computed(
    () =>
      ({
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '')),
        page: page.value,
      }) as Partial<T> & { page: number },
  );
  return { filters, page, setPage, params };
}
